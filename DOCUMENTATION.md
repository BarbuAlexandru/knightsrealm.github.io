# Realm of Knights: The Siege — Current-State Reference

Top-down 2D RTS in **Godot 4.3** (Mobile renderer). One autoload: **`GlobalScript`**
([`scripts/systems/Global/Global_Script.gd`](scripts/systems/Global/Global_Script.gd)), with all shared
constants/enums in **`Global_Enums`** ([`scripts/systems/Global/Global_Enums.gd`](scripts/systems/Global/Global_Enums.gd)).
Physics runs on a separate thread. `objects/` (scenes) mirrors `scripts/` (logic). Pixel art, nearest filter, integer UI scaling.
Note the deliberate spellings `meele` and `wonder` used throughout the code.

**Two level scenes:**
- [`levels/level_test.tscn`](levels/level_test.tscn) — **main scene**, uses a hand-authored [`manual_terrain`](scripts/level/manual_terrain.gd).
- [`levels/level_test_auto.tscn`](levels/level_test_auto.tscn) — uses [`auto_terrain`](scripts/level/auto_terrain.gd), a noise-based procedural world generator.

Both host a `SystemsManager` and a terrain node. `SystemsManager` spawns the `CloudManager` and the
`PlayerCamera` at runtime. `level_test` has a hand-placed player knight; in `level_test_auto` the blue
castle spawns it.

Core loop: units move/fight on a shared field; each is driven either by the **player controller** (input) or an **AI brain**
(autonomous, path-finding on a shared nav grid). Teams gather resources, build houses that spawn worker pawns, and can pause the game.

---

## 1. Entity architecture

Every actor is a `Node2D` with a `$Body` (CharacterBody2D) child holding team sprites + hit/hurt/select boxes.
Inheritance chain (each `extends` the previous):

```
unmoveable_entity → moveable_entity → moveable_meele_entity → unit_base → knight_base → {knights}
(life/damage/select) (movement/states)  (combat/HIT/DEFEND)   (team+hooks)
                            │                   └─ goblin → {goblin_melee, goblin_barrel, goblin_tnt}
                            └─ animal → {sheep, pig}
```
Only the knights descend from `unit_base`; `goblin` extends `moveable_meele_entity` directly and
`animal` extends `moveable_entity` directly.

- **[`unmoveable_entity`](scripts/systems/entities/unmoveable_entity.gd)** — `life` (setter emits `life_changed`),
  `take_damage(dmg, tool)→bool`, `die()`, `select()/deselect()/select_deselect()` (+ `auto_deselect_time`, outline shader),
  team-sprite pick (`init_team_sprite`), `spawn_destroy_object()`, hit-squash tween (`apply_sprite_scale`).
  Fields: `tool`, `hit_by`, `team` (all `Global_Enums` enums), `size`, `tower_mount` (a garrison component registers itself
  here — §6; `die()` drops any mounted unit).
- **[`moveable_entity`](scripts/systems/entities/moveable_entity.gd)** — movement + `state` (`Move_Entity_States`), `knockback_velocity`,
  sprite orientation (`get_all_orientation` biased by `vertical_attack_bias`), `sprint_command`/`sprint_multiplier`, walk particle,
  `register_unit(self)`. Owns the **physics loop** (below).
- **[`moveable_meele_entity`](scripts/systems/entities/moveable_meele_entity.gd)** — combat: `damage`, `knockback`, `attack_range`,
  `attack_groups`, `not_attack_group`, `max_life`, `meele_hitbox`. Adds HIT/DEFEND states; orientation-scaled reach
  (`get_attack_range`, `get_attack_orientation`, up/down factors), `has_vertical_attack`. Garrison hooks: `mounted_on` +
  `on_mounted()`/`on_dismounted()` (hurt-box toggle + `brain.set_mounted`), driven by a tower's `tower_mount` (§6).
- **[`unit_base`](scripts/systems/entities/unit_base.gd)** — sets `team = pick_team`, then runs ordered hooks:
  `configure_unit → _pre_setup → (max_life = life) → init_sprite → register_groups → super()._ready() → bind_hitbox → _post_setup`.
- **Buildings** — see §6. [`building`](scripts/systems/entities/building.gd) (static base),
  [`spawner_building`](scripts/systems/entities/spawner_building.gd) (timed spawns, resource drops on death),
  [`base_knight_building`](scripts/knights/base_knight_building.gd) (player-placed, buildable construction)
  → [`base_knight_standard_building`](scripts/knights/base_knight_standard_building.gd) (the common
  3×3 / 10-life / limit-3 profile) → [`base_knight_training_building`](scripts/knights/base_knight_training_building.gd)
  (groups barracks · archery · monastery).

### Decision → body contract
Controllers/brains never move the unit directly; they set **command flags** the body reads each physics frame:

| Flag | Meaning |
|---|---|
| `move_direction` | desired move vector |
| `char_dir` | facing (derived from movement/target) |
| `attack_command` | request a HIT |
| `defend_command` | hold DEFEND stance |
| `sprint_command` | request sprint |

Two drivers, mutually exclusive per unit: **`controller`** (a `PlayerController`, *polled* via `update_commands()` each frame)
or **`brain`** (an `ai_brain_*`, *self-driven* by timers; registers itself as `owner.brain` in `_ready`).

### Physics loop (`moveable_entity._physics_process`)
```
if controller: controller.update_commands()
handle_state_transitions()   # pick IDLE/RUN/HIT/DEFEND from commands
perform_state_actions(delta) # run the current state's behavior
if needs_movement(): move()  # knockback + move_and_slide, skipped when idle
```
(The goblin barrel overrides this loop with its own barrel FSM; see §4.)

---

## 2. Units

- **Player** — [`player_knight`](scripts/player/player_knight.gd) (extends `knight_general`) + [`PlayerController`](scripts/systems/command/player_controller.gd).
  Controller frees the brain and drives flags from input: move = `ui_left/right/up/down` (WASD/arrows/joypad), attack = **Space**,
  sprint = **Shift** (direct key reads). Has life regen (timer) and joins `Group_Player`. Can also target `Group_Neutral`/`Group_Resource`.
- **Knights** — [`knight_base`](scripts/knights/knight_base.gd) (groups `Group_Knight` + per-team group + `Group_Selectable`,
  binds `MeeleHitBox`, `STARTING_LIFE = 3`, targets goblins + other knights). **Command API** (player UI → unit): `receive_command(Commands)`
  gates on `is_busy()` / `can_receive_command()`, calls `execute_command()` (returns whether it was applied), and **only if applied**
  pops the command's icon via the child `command_indicator` (§8). All three default to no-ops (base knights ignore commands);
  `command_move_to()` is also skipped while `is_busy()`. `knight_base` also exposes `has_active_command()` / `cancel_command()`
  for the command bar (§7): the base pair reports and clears a `Goto` or an active tower garrison (a mounted unit is `is_busy()`;
  cancel climbs it down); the pawn overrides both to also cover its gather/build tasks.
  - [`knight_general`](scripts/knights/knight_general.gd) — strike/recover attack frames, `attack_range = 40`.
  - [`lancer`](scripts/knights/lancer.gd) — long spear reach (`attack_range = 150`), sticky directional defend stance.
  - [`monk`](scripts/knights/monk.gd) — plays a heal animation instead of a strike (healing is applied by [`ai_brain_heal`](scripts/systems/ai/ai_brain_heal.gd)).
  - [`archer`](scripts/knights/archer.gd) — ranged; on the fire frame spawns an [`arrow`](scripts/knights/arrow.gd) that arcs to `fire_target`.
    Can garrison a same-team knight tower (`command_mount_tower`, issued by clicking the tower while the archer is selected — §6 tower garrisons).
  - [`pawn`](scripts/knights/pawn.gd) — worker/builder/**gatherer** (see §6); `PAWN_LIFE = 1`, tool = `TOOL`, not a fighter. `is_busy()` =
    `worker_state != Wonder`; accepts the resource commands (`can_receive_command` = `Gather_Configs.has(command)`, so `GetMeat`/`GetLog`).
- **Goblins** — [`goblin`](scripts/goblins/goblin.gd) base (targets neutrals/knights/buildings, counted in `Group_Goblin`,
  drops a resource on death):
  - [`goblin_melee`](scripts/goblins/goblin_melee.gd) — torch strike, `applies_fire`.
  - [`goblin_barrel`](scripts/goblins/goblin_barrel.gd) — peek FSM → chase → AOE `explode()`.
  - [`goblin_tnt`](scripts/goblins/goblin_tnt.gd) — throws [`throwable_tnt`](scripts/goblins/throwable_tnt.gd); climbs any free
    goblin tower it sees, prioritizing that over combat (§6 tower garrisons).
  - [`goblin_torch_small`](scripts/goblins/goblin_torch_small.gd) — weaker torch spawned by huts.
- **Neutral animals** — [`animal`](scripts/resources/animal.gd) → [`sheep`](scripts/resources/sheep.gd)/[`pig`](scripts/resources/pig.gd)
  (`Group_Neutral`, `Group_Harvestable`, `Group_Meat_Source`; reproduce via brain, drop meat on death).

---

## 3. Combat

- **[`MeeleHitBox`](scripts/systems/hit_hurt/meele_hit_box.gd)** (Area2D, layer `HIT_HURT`) — 4 directional shapes
  (`HitRight/Left/Up/Down`); `attack(orientation)` enables one for a timed window, then auto-disables.
- **[`HurtBox`](scripts/systems/hit_hurt/hurt_box.gd)** (Area2D, mask `HIT_HURT`) — on overlap runs the validation pipeline:

```
self-ignore → should_take_damage:
    line-of-sight RayCast2D (awaits physics frame)  →  _hit_chain_valid (re-check all 4 nodes)
    → attacker_targets_me (attack_groups, not_attack_group)  →  can_take_damage_for_tool_team (team ≠ + hit_by tool)
→ owner.take_damage() → _apply_hit_reactions: deselect, knockback, camera shake (player only), i-frames + hit flash, particle, fire
```
`hit_by_projectile(attacker)` is the entry point projectiles (arrows) use instead of area overlap.

- **States: IDLE / RUN / HIT / DEFEND** (`Move_Entity_States`). Concrete units implement `state_hit_action` / `state_defend_action`
  keyed off animation frames (contact frames trigger `meele_hitbox.attack`, end frames return to IDLE).
- **Projectiles/AOE:** [`arrow`](scripts/knights/arrow.gd) (parabolic arc, hits `hit_by_projectile` or impales),
  [`throwable_tnt`](scripts/goblins/throwable_tnt.gd) and goblin barrel `explode()` call `GlobalScript.deal_aoe_damage`
  (separate building vs. normal damage, excluded group, radius query over `Group_Selectable`).
- **[`fire`](scripts/vfx/fire.gd)** — host-configured flame system: staggered ignition, per-flame jitter, and an optional burn-out
  hit (`fire_end_damage`, buildings only). Applied by `goblin_melee` (`applies_fire`) via the hurt-box pipeline.

---

## 4. AI brains

Each brain is a scene child of the unit exposing `$StateTimer`, `$TickTimer` (physics-tick), `$Debugger`, and
`$Vision` (Area2D) + `$Vision/VisionArea`. States from **`Ai_States`**
(`Wonder, Hold, Defend, Escape, Attack, Follow, Idle, Build, GetResource, Reproduce, Destroy, Goto`).
`ai_state` is a property on [`ai_brain_base`](scripts/systems/ai/ai_brain_base.gd): every write calls
`_on_ai_state_changed()`, so subclasses that assign it directly (rather than through `enter_state`)
still notify. `ai_brain_wonder` uses that hook to clear the move marker (§8).

### Layered hierarchy
- **[`ai_brain_base`](scripts/systems/ai/ai_brain_base.gd)** — the movement/perception engine. Sizes the vision radius,
  runs a physics-tick loop, and provides:
  - **Path-following** (`move_towards`/`follow_path_to`): uses line-of-sight shortcutting, else pulls a path from the
    shared nav grid (`GlobalScript.get_path_points`), advances waypoints, and repaths on interval / nav changes / goal drift.
  - **Reactive steering** (`_steer`, smoothed turn) + **wall avoidance** (`_avoid_obstacles` via raycasts, commit hysteresis);
    the avoid heading is biased outward along the wall normal (`AVOID_CLEARANCE`) so units keep a gap instead of hugging obstacles.
  - **Vision helpers** (`_nearest_in_vision(accept)`), state entry (`enter_state`), and a debug path/state overlay
    (visible only when `debug_mode` and the unit is selected).
- **[`ai_brain_wonder`](scripts/systems/ai/ai_brain_wonder.gd)** — base wander behavior: Idle ↔ Wonder with wall-bounce off slide collisions.
  On reaching a `Goto` target it holds in `Idle` for `goto_arrival_pause` (1s) before resuming Wonder, so it settles instead of jittering at the arrival point.
- **[`ai_brain_targeting`](scripts/systems/ai/ai_brain_targeting.gd)** — adds `$SearchTimer` and `_closest_target(preferred, priority_group)`,
  filtered by the owner's `attack_groups` / `not_attack_group` (overridable, e.g. the healer).
- **[`ai_brain_basic_attack`](scripts/systems/ai/ai_brain_basic_attack.gd)** — seek → Attack state: chase along a path with a random
  hold offset, then a hold/align phase (axis alignment before striking, hysteresis) and `attack_cooldown`; `_on_attack_triggered()` hook.

### Concrete brains
- [`ai_brain_knight`](scripts/systems/ai/ai_brain_knight.gd) — melee (wider vision).
- [`ai_brain_spear`](scripts/systems/ai/ai_brain_spear.gd) — aligns on an axis, raises `defend_command` while aligned.
- [`ai_brain_throw`](scripts/systems/ai/ai_brain_throw.gd) — kites within a throw band (`keep_distance`…`throw_range`, orbit
  direction random per unit), prioritizes buildings, `_on_fire` hook. Also hosts the shared tower-garrison machinery (§6):
  `go_to_tower()` claims the tower and walks there (reusing `Goto`), mounting on arrival; `set_mounted()` swaps
  `stationary`/`throw_range`/vision radius for the tower profile and back (re-anchoring `home_position` at the tower on dismount).
- [`ai_brain_archer`](scripts/systems/ai/ai_brain_archer.gd) — extends throw; feeds `owner.fire_target`.
- [`ai_brain_tnt`](scripts/systems/ai/ai_brain_tnt.gd) — extends throw; each search tick (unless mounted or already en route)
  it looks for a free same-team tower in vision and goes to mount it — top priority, above chasing targets.
- [`ai_brain_barrel`](scripts/systems/ai/ai_brain_barrel.gd) — barrel FSM (`Barrel_States`: HIDDEN/OPENING/LOOKING/CHASE/CLOSING/EXPLODING),
  periodic peeking, chase, then explode.
- [`ai_brain_heal`](scripts/systems/ai/ai_brain_heal.gd) — targets same-team damaged knights, spawns a heal effect (no alignment).
- [`ai_brain_reproduce`](scripts/systems/ai/ai_brain_reproduce.gd) — timer → find a mate in vision → path to it → `duplicate()`
  (capped by `Neutral_Limit`).
- [`ai_brain_pawn`](scripts/systems/ai/ai_brain_pawn.gd) — worker brain: wanders near `home_position`. Two command machines, each a
  sub-phase int gated on its `ai_state` (mirrors of the same skeleton):
  - **Build** (`ai_state == Build`): `start_build()` → GOING to the site → HAMMERING (`construction_hit()` on cooldown) → RETURNING home.
  - **GetResource** (`ai_state == GetResource`): `start_gather(config, castle)` → GOING (nearest source or dropped pickup) →
    HARVESTING (swing on cooldown; on exhaustion `_seek_pickup()` grabs the drop) → RETURNING (deposit at the castle **front**,
    `_drop_point()`) → HOMING (walk back to spawn), then wander. See §6.
  - **Cancel** (from the command bar, §7): both machines exit through a shared `_go_idle()` (→ `_finish` / `_finish_build`);
    `cancel_build()` demolishes the still-unfinished site and refunds it (§6), `cancel_gather()` drops the carried pickup back on
    the ground when interrupted mid-delivery (only the RETURNING phase carries one), then each returns to wandering. The final
    walk-home leg (`is_returning_home()`: gather `HOMING` / build `RETURNING`) is **not** a cancelable task — the pawn is only
    heading back to its spawn to wander, so `pawn.has_active_command()` reports false and the Cancel button hides.

---

## 5. Navigation (shared A* grid)

Navigation is a custom **`AStarGrid2D`** over the tile grid, owned by `GlobalScript` (replacing per-agent NavigationAgent2D):

- **`register_terrain(grass, walls, sand = null)`** — terrain nodes register their `Grass` / `Walls` / `Sand` `TileMapLayer`s.
- **`is_buildable_grass(coords)`** — grass present and no wall present.
- **`build_nav_grid()`** — builds the grid over the merged used-rect (grown by 2), marks non-buildable cells solid, then marks
  every blocking obstacle. Bumps `nav_version` (brains repath when it changes). Called after terrain + object spawning.
- **Obstacles** — `register_obstacle(node)` occupies a node's `footprint` (default 1×1) via ref-counted cell occupancy
  (`_occupy_cells`); cells free automatically on `tree_exiting`. `GlobalScript.spawn_entity` auto-registers anything in a
  `Building_Blocking_Groups` group (`building`, `construction`, `resource`).
- **`get_path_points(from, to)`** — snaps endpoints to the nearest passable cell and returns world-space waypoints.

---

## 6. Teams, economy & building

### TeamController
**[`TeamController`](scripts/systems/command/team_controller.gd)** (RefCounted, one per team, lazy-created by `GlobalScript.get_team_controller`):

- **Resources** `gold`/`wood`/`food` (start at **30** each): `can_afford`/`spend`/`add_resource`/`get_resource`,
  **`resources_changed`** signal. Resource-button hooks `on_meat_button`/`on_log_button`/`on_gold_button` → `_command_free_pawn(Commands.*)`
  send the matching gather command to a **random idle** pawn (§6 pawn gather flow).
- **Units** — `units` list; `TROOP_LIMIT = 50`, `can_add_troop()`.
- **Buildings** — `buildings` + per-type `building_counts`; `get_building_count`/`can_add_building_type`, **`buildings_changed`** signal.
- **Workers (pawns)** — `workers` / `idle_workers`, `register_worker`/`set_worker_idle`, **`workers_changed`** signal; and a
  `build_queue` with `request_build` → `_dispatch_build` that assigns the **closest idle worker** to each queued construction site.

### Buildings
- **[`building`](scripts/systems/entities/building.gd)** — static base (life/team).
- **[`spawner_building`](scripts/systems/entities/spawner_building.gd)** — timer ticks `pick_spawn()` up to `spawn_cap`
  (counted via `count_group`), slowly self-heals, drops `Resource_Drops` on death. Used by goblin buildings.
- **[`base_knight_building`](scripts/knights/base_knight_building.gd)** — player-placed building with a **construction** phase:
  it spawns as a translucent site in `Group_Construction` (`_set_site_disabled`: physics + hurt off, and the SelectBox's
  `collision_layer` zeroed — the camera point-picks by layer, so `monitorable` alone would not stop a site being selected) needing
  `get_construction_hits()` hammer taps before `_activate()` (fades in, enables collisions, registers groups).
  Subclasses describe themselves through overridable hooks — one source of truth per building, read both by the
  instance and by the building bar:

  | Hook | Default | Purpose |
  |---|---|---|
  | `get_building_type()` | `&"knight_building"` | per-type key for counts/limits |
  | `get_building_limit()` | `99` | max per team |
  | `get_footprint()` | `1×1` | tiles occupied: placement grid **and** nav obstacle |
  | `get_size()` | `1.0` | explosion/destroy-effect scale |
  | `get_ghost_offset()` | `(0, -46)` | placement-ghost sprite offset; **must match the `CharSprite` y in the `.tscn`** |
  | `is_first_build_free()` | `false` | first of this type costs nothing (house only) |
  | `requires_builder()` | `true` | if true, cannot be placed with no pawn alive |
  | `get_construction_hits()` | `Construction_Hits` (5) | hammer taps to finish |
  | `get_recruit_entries()` | `[]` | units this building can recruit (§7 recruiting) |

- **[`knight_house`](scripts/knights/knight_house.gd)** — buildable (2×2, limit 5). First one is **free**, and it is the only
  building placeable with **no pawn alive** (it's what produces the first pawn); with a pawn present it builds as a
  construction site. Spawns one worker **pawn** and, if it dies, respawns after a delay (subject to `TROOP_LIMIT`).
- **Training buildings** — [`knight_barracks`](scripts/knights/knight_barracks.gd),
  [`knight_archery`](scripts/knights/knight_archery.gd), [`knight_monastery`](scripts/knights/knight_monastery.gd).
  All extend `base_knight_training_building` and are pure identity: 3×3, limit 3, 8 log + 8 gold (base),
  10 life, **10** construction hits. Each requires a pawn to build; never free. Each carries a
  `recruiting_system` (§7) via `get_recruit_entries()` — barracks→lancer, archery→archer, monastery→monk.
  The monastery overrides `get_ghost_offset()` to
  `(0, -110)` because its art is 192×320 rather than 192×256.
- **[`knight_tower`](scripts/knights/knight_tower.gd)** — same profile, but extends
  `base_knight_standard_building` directly: deliberately **not** a training building. Carries a `TowerMount`
  (archer garrison, range 350 — see *Tower garrisons* below) plus its own `CommandSystem`/`CommandIndicator`:
  selecting a garrisoned tower shows the Cancel button, which climbs the archer down.
- **[`knight_castle`](scripts/knights/knight_castle.gd)** — 5×3, 20 life, limit 1. **Not** in the building bar:
  `auto_terrain` spawns one per team in a random corner (see §9). Carries a `recruiting_system` (§7) that
  recruits the `knight_general`, and is the **drop-off** for gathered resources (found via
  `get_building_type() == Building_Type_Castle`; §6 pawn gather flow).

> **Invariant:** a building's `get_ghost_offset()` must equal the `position.y` of the `CharSprite` nodes in
> its `.tscn`, and all four per-team sprites must agree. Nothing enforces this; a mismatch misaligns the
> placement ghost against where the building actually lands. It has caused real bugs twice.
- **Goblin buildings** ([`goblin_building`](scripts/goblins/goblin_building.gd) → [`goblin_house`](scripts/goblins/goblin_house.gd)/
  [`goblin_hut`](scripts/goblins/goblin_hut.gd)) — spawners (`spawn_cap = Goblin_Limit`). House rolls torch/barrel/tnt by chance;
  hut spawns small torches. [`goblin_tower`](scripts/goblins/goblin_tower.gd) — a plain spawner-profile building carrying a
  `TowerMount` (TNT-goblin garrison, range 300): world gen mounts a `goblin_tnt` on it by chance (§9), and wandering TNT
  goblins climb free ones on their own.

### Tower garrisons (`tower_mount`)
Both towers carry a **[`tower_mount`](scripts/systems/entities/tower_mount.gd)** component node (self-registers as
`owner.tower_mount`, like brains do). It owns the whole lifecycle: `claim`/`release` (one candidate at a time, so two
units never race for a tower), `mount(unit)` — reparents the **live unit node** onto the tower at `mount_position`
(`z_index` above the tower sprite, hurt-box off, knockback cleared, sprite alpha matched to the tower's fade, brain
`set_mounted` → stationary at `mounted_range`) — and `drop()`, which reverses everything at the tower base and runs
automatically from `unmoveable_entity.die()`. Because the same node is reparented, unit and tower each keep their
exact life across mount/dismount (no life writes, so no health-bar reveals). Compatibility is a single rule:
`unit.team == tower.team` — goblins and goblin towers are both team NO, archers need their own color's tower, and the
two factions can never climb each other's towers. Mounted units are `is_busy()` (move/gather commands are refused) and
cancel through the command bar — their own or the tower's, whichever the player selects. Selection outlines and
`player_transparency` fades cover tower + mounted unit together.

A mounted unit is **shielded — the tower takes every hit meant for it** until the tower falls and drops it:
`ai_brain_targeting._closest_target` redirects a mounted *enemy* to its tower (same-team brains, e.g. the healer,
still reach the unit); the tower's hurt-box accepts attackers that target its garrison even if they never target
buildings (`attacker_targets_me`, so knights can raze a garrisoned goblin tower); `hurt_box.hit_by_projectile`
forwards a mounted unit's hit to the tower's hurt-box (arrows); and `deal_aoe_damage` skips mounted units (the
tower takes its own AOE hit). Melee overlap was already off (`on_mounted` disables hurt-box `monitoring`).

### Building prices (escalating)
Costs in `BUILDING_ENTRIES` are **base** costs. Each building of that type the team already owns makes the
next one dearer: `multiplier = 1 + Building_Price_Step × owned` (`0.5`), i.e. ×1, ×1.5, ×2, … So a barracks
runs 8/8 → 12/12 → 16/16. The basis is *currently owned* (`get_building_count()`), so losing a building
lowers the price again. The knight house's free first build still advances the multiplier.

All of it lives in `building_bar._effective_cost()`, the single source feeding the price labels, the
affordability grey-out, `spend()`, and the refund — so the multiplier propagates without being written twice.
The price *labels* clamp at `UI_Number_Max` (99) while the real cost keeps scaling; only reachable if a
building's limit is raised past ~12.

### Pawn build flow
`knight_house` spawns a `pawn` (has `ai_brain_pawn`, registers as a worker). Placing a building via the building bar calls
`TeamController.request_build`, which dispatches the closest idle worker: the pawn equips a hammer, walks to the site, taps
`construction_hit()` on cooldown until built, then returns home and goes idle. If a pawn dies mid-build, its target is re-queued.
A queued site is dispatched whenever a worker goes idle **or a new pawn registers**, so a fresh pawn picks up pending work.
Cancelling a build from the command bar (§7) calls `base_knight_building.demolish()`: it refunds the instance's `build_cost` — the
exact escalated price, captured on the building by `placement_controller._build` at placement time — to the team and frees the site
(nav-cell and building-count cleanup ride the normal `tree_exiting` path, same as a building dying), and the pawn returns to
wandering. An already-finished building is never demolished (a `not is_built` guard), and a free first house refunds nothing.

### Pawn gather flow
A resource button / **Z/X/C** sends `GetMeat`/`GetLog` to a random **idle** pawn (`TeamController._command_free_pawn`).
`pawn.execute_command` reads the recipe from **`Gather_Configs`** (source group, pickup group, `ResourceType`, and the
tool/hit/carry animations) and commits **only if** a recipe exists (gold has none → icon-only stub), a **built castle** exists, and
the brain finds a valid target — otherwise the command is dropped (no icon, pawn stays free). The `ai_brain_pawn` GetResource
machine (§4) then walks to the nearest source (tree / sheep-pig, wearing the axe/knife) or dropped pickup (empty-handed);
harvests a source through **its HurtBox** (`hit_by_projectile`, landing on the pawn's strike frame, so it flashes/knocks back
exactly like a combat hit) until it drops a pickup; `collect()`s the pickup, switches to the carry animation, delivers to the
**front** of the castle and `add_resource(type, 1)` (meat→FOOD, log→WOOD), then walks home and wanders. Losing the target
(collected / cut / killed by anyone) re-acquires; a destroyed castle cancels the delivery straight back to wandering,
empty-handed. The pawn is `is_busy()` the whole trip (uninterruptible by move/gather orders), freeing only once home — like build.
Adding a new gatherable is a one-place change: a `Gather_Configs` entry (the pawn/brain code is generic over it).

### Placement
**[`placement_controller`](scripts/systems/command/placement_controller.gd)** — a world-space ghost + grid overlay: snaps a
footprint to tiles, validates each cell (`is_buildable_grass` and not already occupied — snapshotted at start), tints invalid
cells red. The ghost uses the building's `get_ghost_offset()`. **Left-click** builds (spends already deducted at button press;
spawns as a construction site if the building `requires_builder()` or a worker exists, else instantly active),
**right-click** cancels and refunds. Registers the new building as a nav obstacle.
Picking a *second* building before placing the first refunds the first — `start_placement()` calls `_refund()`
when it is already `active`, otherwise the first payment would be silently lost.

### Resources
Harvest sources are hit by `Tools.TOOL`:
- [`tree`](scripts/resources/tree.gd) (`Group_Log_Source`; drops a log, regrows on a timer, chance to respawn animals).
- [`gold_ore`](scripts/resources/gold_ore.gd) (`Group_Gold_Source`; random ore level → sizes collision/hitbox, yields gold per
  destruction, steps down levels, periodic shine).
- [`mine`](scripts/resources/mine.gd) (`Group_Gold_Source`; DESTROYED→IDLE→ACTIVE FSM: repaired with TOOL, then mined for gold).

Dropped pickups: [`pickable_resource`](scripts/resources/pickable_resource.gd) → [`gold`](scripts/resources/gold.gd)/
[`log`](scripts/resources/log.gd)/[`meat`](scripts/resources/meat.gd) (arc-throw on spawn, despawn timer; join `Group_*_Resource`).
A gathering pawn removes one with `collect()` (stops the despawn timer + frees it). **HUD mapping: meat→FOOD, log→WOOD, gold→GOLD.**

---

## 7. UI / HUD layer

Orchestrated by **[`systems_manager`](scripts/systems/systems_manager.gd)** (in each level): creates the 4 play `TeamController`s,
sets `get_window().min_size`, spawns the HUD + building bar + placement controller + pause overlay, owns `player_team`
(also published to `GlobalScript.player_team`, read by the recruiting panels to gate to the player's buildings) and
`_toggle_pause()`. It wires the top bar's hammer → building bar → placement controller.

- **[`base_bar`](scripts/ui/base_bar.gd)** — shared CanvasLayer base for the bars: 3-slice tiled backgrounds (`_tile_row`),
  MedievalSharp number/icon label factories, and a number+icon cost-row factory (`make_icon_row`, shared by the building
  bar and the recruiting panels).
- **[`top_bar`](scripts/ui/top_bar.gd)** ([`.tscn`](objects/ui/top_bar.tscn), layer 10) — left HUD bar showing the player team's
  meat/log/gold counts (live via `resources_changed`, clamped to 99) each beside an icon button, a **pawn count** (free/total,
  live via `workers_changed`), and a hammer button; plus a separate **menu button** top-right. Hotkeys: **Z/X/C** press the
  resource buttons (each `→ TeamController.on_*_button`, commanding a free pawn to gather — §6), **B** toggles the building bar.
  Signals `menu_pressed`, `hammer_pressed`, `hammer_hotkey`. API `bind_team`, `set_hud_visible`.
- **[`building_bar`](scripts/ui/building_bar.gd)** ([`.tscn`](objects/ui/building_bar.tscn), layer 10) — bottom-left build palette
  built from `BUILDING_ENTRIES` (house, barracks, archery, monastery, tower). Each entry is `{scene, script, icons, log, gold}` — every
  other property is read off the script's static hooks (§6), so nothing is declared twice. Each cell shows the building
  icon + a live count `built/limit`, reveals its gold/log price on hover, greys out when unaffordable, at limit, or when
  the building `requires_builder()` and the team has no pawn; on press it spends resources then emits `build_requested`
  (→ placement controller). A single `_refresh_buttons()` (bound to `resources_changed`, `buildings_changed` and
  `workers_changed`) drives cost, affordability and count together. Closes on a **left or right** click outside it
  (wheel and middle-click are ignored); `_was_open_at_press` is recorded on left-click only, so the hammer toggle
  stays correct. `on_hammer_pressed`/`toggle` open it.
- **[`building_button`](scripts/ui/building_button.gd)** — extends `button_general`; carries scene/type/limit/cost/footprint +
  `count_label`, greys via `affordable`.
- **[`recruiting_system`](scripts/ui/recruiting_system.gd)** ([`.tscn`](objects/ui/recruiting_system.tscn), extends `base_bar`,
  layer 9) — a per-building recruit panel, instanced as a child of each training building + the castle, that only activates
  for the player's own buildings (`building.team == GlobalScript.player_team`). It reads the building's `get_recruit_entries()`
  (each `{scene, icon, gold, food}`, from `Global_Enums.Recruit_*`) and, while the building is **selected** and built, shows one
  reused `building_button` per unit anchored above it in **screen space** (`building.get_global_transform_with_canvas()`; buttons
  are fixed-size and manually centered so there is no first-frame layout jump), with the price hovering to its left (meat over
  gold, revealed by a geometric hover test). It reuses the `affordable` grey-out (also greying at `TROOP_LIMIT`) and spends via
  the team's `TeamController`. On press it spends, hides the buttons, and shows a **separate** icon in the same spot that fades
  100%→20% over `Recruit_Time` as a loading indicator, then `GlobalScript.spawn_entity`s the unit in front of the building. The
  icons carry the `outline` shader as a silhouette highlight — its `fade` uniform fades sprite + outline together.
- **[`command_system`](scripts/systems/command/command_system.gd)** ([`.tscn`](objects/systems/command/command_system.tscn),
  extends `base_bar`, layer 9) — the unit-command counterpart of the recruiting panel, instanced as a `CommandSystem` child of each
  of the five unit scenes (knight/lancer/monk/archer/pawn) **and the knight tower** (whose Cancel dismounts its archer), active only
  for the player's own units (`unit.team == player_team`, else its `_process` never starts). While the unit is **selected** and
  `unit.has_active_command()` it shows a vertical stack of reused `button_general`s anchored above the unit in screen space
  (`get_global_transform_with_canvas()` at a per-scene height — `anchor_offset_y`, −70 for units / −180 on the tower; fixed-size
  and manually centered off a cached column height, so there is no per-frame layout). Phase 1 is a single **Cancel** button (`Icon_Cancel`,
  its icon read from `Command_Icons`). On press, `_issue()` runs the command's action (`unit.cancel_command()`), pops the command's
  icon via the unit's `command_indicator` (§8), deselects the unit and hides the panel. Adding a command is one
  `_add_button(Commands.X, unit.method)` line — icon lookup, indicator pop and deselect all come for free.
- **[`button_general`](scripts/ui/button_general.gd)** ([`.tscn`](objects/ui/button_general.tscn)) — reusable `TextureButton`:
  `icon`, `button_id`, hover-lighten / press-darken+dip on its `$Icon`, `flash_press()`, `focus_mode = NONE` (so Space can't
  trigger it). `on_pressed()` override hook.
- **[`button_wide`](scripts/ui/button_wide.gd)** ([`.tscn`](objects/ui/button_wide.tscn)) — extends `button_general`, adds a centered `text` label.
- **[`pause_overlay`](scripts/ui/pause_overlay.gd)** ([`.tscn`](objects/ui/pause_overlay.tscn), layer 11, `process_mode = ALWAYS`) —
  full-screen [`pause_blur.gdshader`](scripts/shaders/pause_blur.gdshader), "Paused" title, scaled `button_wide` **Resume**. Signal `resume_pressed`.
- **Pause flow**: menu button → `_toggle_pause` → `get_tree().paused = true`, HUD + building bar hidden, overlay shown; **Resume** → unpause.
- **[`player_camera`](scripts/player/player_camera.gd)** — follows the knight with a horizontal lead buffer; recenters on viewport
  resize (works while paused); world click-pick via point query (mask `SELECTABLE`, sorted by Y → `on_left_click`) in
  `_unhandled_input` (so UI clicks are not stolen). A click that hits a same-team garrison tower while an eligible archer is
  selected instead dispatches the closest one to mount (`_try_mount_command`); everything else falls through to normal selection.
  Wheel zoom, noise shake, water shader feed, debug overlay.
  Debug keys: `,` toggles `debug_mode`, `.` toggles player tool (WEAPON/TOOL).
- **Selection** — [`select_box`](scripts/systems/select_command/select_box.gd) (Area2D on the body, `SELECTABLE` layer):
  its `on_left_click()` calls `owner.select_deselect()` (outline shader + auto-deselect timer).

---

## 8. Health bars & VFX

- **[`health_manager`](scripts/systems/hit_hurt/health_manager.gd)** — heart-bar (`hp.png` atlas) above an entity. Walks up to
  find the nearest ancestor with `life`, listens to `life_changed`, and **reveals on damage** (or heal) for `Health_Reveal_Time`;
  hearts are built lazily on first reveal (so undamaged units never show a bar). For the **player** (`Group_Player`) the bar is
  *persistent* (only hides once back to full). This is the "single life write" concern from the memory note: set life once
  (`get_starting_life()`), or the bar reveals at spawn.
- **[`player_transparency`](scripts/systems/entities/player_transparency.gd)** — an Area2D that fades an entity's sprite when the
  player overlaps it (so the player isn't hidden behind buildings/trees) and restores it on exit; a garrisoned tower fades its
  mounted unit's sprite in the same tween.
- **[`destroy_effect`](scripts/systems/entities/destroy_effect.gd)** base → death/explosion/heal effects (auto-free on animation end).
- **[`move_marker`](scripts/vfx/move_marker.gd)** — a translucent blue dot drawn (`_draw`, no art asset) where a
  commanded unit was told to go. Created lazily by `ai_brain_wonder.go_to()` as a child of the **brain** with
  `top_level = true`, so it stays at the clicked point instead of following the unit, and is freed with it.
  Hidden by `_on_ai_state_changed()` as soon as the brain leaves `Goto` — arrival, a new order, a build
  assignment, or a fight. `z_index = Z_Move_Marker` (−1) puts it above the grass (−10) and below the units (0).
- **[`command_indicator`](scripts/systems/command/command_indicator.gd)** ([`.tscn`](objects/systems/command/command_indicator.tscn)) —
  a **generic** per-unit node — a `CommandIndicator` child of every knight-unit scene (knight/lancer/monk/archer/pawn). `show_command(Commands)`
  spawns that command's icon (from `Command_Icons`) above the unit and tweens it up while fading, then frees **just the icon** (the
  node persists). Popped by `receive_command` only when a command is actually applied, by `pawn.assign_build` for the hammer, and by
  the `command_system` (§7) for the Cancel icon.
- **[`cloud_manager`](scripts/vfx/cloud_manager.gd)** — CanvasLayer, `layer = Layer_Clouds` (**5**, set in code;
  the `.tscn` value is overridden), `follow_viewport`, drifting clouds faded by zoom.
- Shaders: `outline` (selection + recruit highlight; detects the silhouette from the raw texture alpha and has a `fade`
  uniform, default 1, that fades sprite + outline together), `solid_color` (hit flash + placement ghost), `water`, `pause_blur`.

---

## 9. World generation

**[`auto_terrain`](scripts/level/auto_terrain.gd)** (used by `level_test_auto`) procedurally builds the world from a
`NoiseTexture2D` and a **[`terrain_config`](scripts/level/terrain_config.gd)** resource:

1. Sample noise into a cache; apply an edge **falloff** so the map is an island.
2. Classify each cell by normalized noise into water / sand / grass / walls tiers (`sand_level`/`grass_level`/`walls_level`).
3. Underlay tiers, thicken walls (`remodel_walls`), then paint via `set_cells_terrain_connect`; add shadows, borders + water foam, decorations.
4. `spawn_objects()` (deferred): first `spawn_castles()` — one castle per play team, each in a **different randomly-assigned
   corner**, searching a corner band (then the whole quadrant, then anywhere) for ground clear enough for its footprint plus a
   one-tile ring; each castle spawns a knight in front of it, and the **blue** castle spawns the `player_knight`. Then scatter
   neutral animals, trees, mines, gold ore, goblin houses/huts/towers (each tower rolls `goblin_tower_tnt_chance` to spawn with
   a TNT goblin already mounted; spacing-checked via `get_obj_spawn_coords`), and grass
   deco props; finally `GlobalScript.build_nav_grid()`.

Helpers use **[`tile_index_set`](scripts/level/tile_index_set.gd)** — an ordered set of `Vector2i` with O(1) `has`/`erase`/`pick_random`.

**[`manual_terrain`](scripts/level/manual_terrain.gd)** (used by the main `level_test`) is simpler: hand-placed `Grass`/`Walls`
layers; it just registers terrain and builds the nav grid.

---

## 10. Reference tables

**CanvasLayers:** clouds `5` (`Layer_Clouds`, set in `_ready`), recruiting_system + command_system `9`, top_bar `10`, building_bar `10`, pause_overlay `11`.

**Z-index:** `Z_Move_Marker = -1` (above grass `-10`, below units `0`) · `Z_UI = 100`.

**Collision layers** (`Global_Enums.Collision_Layer`, values used directly as `collision_layer`/`collision_mask`):
`PHYSICS = 1` · `HIT_HURT = 2` · `VISION = 4` · `CAMERA = 8` · `SELECTABLE = 128` (used by click-pick and AI vision).

**Key enums** (`Global_Enums`): `Teams{NO,BLUE,RED,PURPLE,YELLOW}` · `Tools{NO,WEAPON,TOOL}` · `ResourceType{NONE,GOLD,WOOD,FOOD}` ·
`Move_Entity_States{IDLE,RUN,HIT,DEFEND}` · `Ai_States{Wonder,Hold,Defend,Escape,Attack,Follow,Idle,Build,GetResource,Reproduce,Destroy,Goto}` ·
`Pawn_States{Wonder,GetMeat,GetLog,GetGold,ReturnMeat,ReturnLog,ReturnGold,Build}` · `Commands{GetMeat,GetLog,GetGold,Build,Cancel}` ·
`Tree_States` · `Mine_States` · `Barrel_States{HIDDEN,OPENING,LOOKING,CHASE,CLOSING,EXPLODING}` · `Orientation{RIGHT=1,UP=2,LEFT=3,DOWN=4}`.
Command data lives in `Command_Icons` (Commands→icon, incl. `Cancel`→`Icon_Cancel`) and `Gather_Configs` (GetMeat/GetLog → source/pickup groups + `pickup_scene` + `ResourceType` + animations;
gold intentionally absent). `Building_Type_Castle = &"knight_castle"`.

**Key groups:** `player, knight, goblin, neutral, sheep, pig, building, construction, selectable, resource, harvestable,
log_source/meat_source/gold_source, log_resource/meat_resource/gold_resource, camera` (+ per-team `knight_BLUE`, `building_RED`, …).

**Input:** movement `ui_left/right/up/down` (WASD/arrows/joypad); attack `Space`, sprint `Shift` (direct reads);
resource-button hotkeys `Z/X/C` (command a free pawn to gather meat/log; gold is a stub), building bar `B`;
`,` toggles debug, `.` toggles player tool; mouse-wheel zoom.
**Left-click**: select a unit / place a building / command selected units to walk (drops a move marker) / send a selected
archer onto a clicked same-team knight tower.
**Right-click**: cancels a placement (refunding it), deselects all units, and closes the building bar.

**Colors:** `Color_Build_Outline`, `Color_Build_Invalid`, `Color_Move_Marker` (+ `Move_Marker_Radius`).

**Starting resources:** gold/wood/food = 30. **Limits:** `TROOP_LIMIT = 50`, `Goblin_Limit = 20`, `Neutral_Limit = 100`,
knight house limit 5 (first free), castle 1, barracks/archery/monastery/tower 3 each. `Construction_Hits = 5` is the
default; buildings override it via `get_construction_hits()` (the standard buildings use 10).
**Prices** escalate by `Building_Price_Step = 0.5` per building of that type already owned (§6).
**Recruiting:** each training building + castle hosts a `recruiting_system`; units (lancer/archer/monk/general) cost
1 meat + 1 gold each and take `Recruit_Time = 20s` (§7).

**Conventions:** scenes in `objects/` mirror scripts in `scripts/`; self-explanatory code, comments only for non-obvious intent;
spellings `meele`/`wonder` are intentional.
