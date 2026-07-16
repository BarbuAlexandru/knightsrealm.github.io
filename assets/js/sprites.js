/* =========================================================================
   Knight's Realm — spritesheet animation engine.

   The game's sheets are uniform grids (with some partially-filled rows),
   so every animated element declares exactly which cells to play:

   <div class="sprite"
        data-sheet="art/Factions/Knights/Blue/Warrior_Blue.png"
        data-cols="6"    grid columns in the sheet
        data-rows="8"    grid rows in the sheet
        data-row="0"     row to play (0-based)
        data-from="0"    first frame in that row (0-based)
        data-count="6"   how many frames to play
        data-fps="8"     playback speed
        data-scale="0.5" display scale (0.5 = half game pixels)
        data-flip        (optional) mirror horizontally
   ></div>

   Frame size is derived from the image's natural size / grid, so no pixel
   dimensions are hard-coded. Sprites only animate while on screen, and
   freeze on their first frame when the visitor prefers reduced motion.
   ========================================================================= */

(function () {
  "use strict";

  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const imageCache = new Map(); // sheet url -> Promise<HTMLImageElement>
  const active = new Set();     // sprites currently visible + animating

  function loadSheet(url) {
    if (!imageCache.has(url)) {
      imageCache.set(url, new Promise(function (resolve, reject) {
        const img = new Image();
        img.onload = function () { resolve(img); };
        img.onerror = reject;
        img.src = url;
      }));
    }
    return imageCache.get(url);
  }

  function readConfig(el) {
    return {
      sheet: el.getAttribute("data-sheet"),
      cols:  parseInt(el.getAttribute("data-cols"), 10) || 1,
      rows:  parseInt(el.getAttribute("data-rows"), 10) || 1,
      row:   parseInt(el.getAttribute("data-row"), 10) || 0,
      from:  parseInt(el.getAttribute("data-from"), 10) || 0,
      count: parseInt(el.getAttribute("data-count"), 10) || 1,
      fps:   parseFloat(el.getAttribute("data-fps")) || 8,
      scale: parseFloat(el.getAttribute("data-scale")) || 1,
    };
  }

  /* Size the element and paint one frame; returns per-sprite state. */
  function setup(el, img) {
    const c = readConfig(el);
    const fw = img.naturalWidth / c.cols;
    const fh = img.naturalHeight / c.rows;
    const s = c.scale;

    el.style.width = Math.round(fw * s) + "px";
    el.style.height = Math.round(fh * s) + "px";
    el.style.backgroundImage = 'url("' + c.sheet + '")';
    el.style.backgroundSize = (img.naturalWidth * s) + "px " + (img.naturalHeight * s) + "px";
    el.style.backgroundRepeat = "no-repeat";

    const state = { el: el, cfg: c, fw: fw, fh: fh, frame: 0, acc: 0 };
    paint(state);
    return state;
  }

  function paint(st) {
    const c = st.cfg;
    const x = -((c.from + st.frame) * st.fw * c.scale);
    const y = -(c.row * st.fh * c.scale);
    st.el.style.backgroundPosition = x + "px " + y + "px";
  }

  /* Single rAF loop drives every visible sprite at its own fps. */
  let last = null;
  function tick(now) {
    if (last !== null && !reducedMotion.matches) {
      const dt = (now - last) / 1000;
      active.forEach(function (st) {
        st.acc += dt;
        const step = 1 / st.cfg.fps;
        if (st.acc >= step) {
          st.frame = (st.frame + Math.floor(st.acc / step)) % st.cfg.count;
          st.acc = st.acc % step;
          paint(st);
        }
      });
    }
    last = now;
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);

  /* Only animate sprites that are on screen. */
  const states = new Map(); // element -> state
  const io = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      const st = states.get(entry.target);
      if (!st) return;
      if (entry.isIntersecting) active.add(st);
      else active.delete(st);
    });
  }, { rootMargin: "100px" });

  function initSprite(el) {
    loadSheet(el.getAttribute("data-sheet")).then(function (img) {
      const st = setup(el, img);
      states.set(el, st);
      io.observe(el);
    }).catch(function () {
      el.classList.add("sprite-failed");
    });
  }

  /* Re-read config + sheet for an element (used by the team switcher). */
  function refresh(el) {
    const st = states.get(el);
    if (st) { active.delete(st); io.unobserve(el); states.delete(el); }
    initSprite(el);
  }

  document.querySelectorAll(".sprite[data-sheet]").forEach(initSprite);

  window.KRSprites = { refresh: refresh };
})();
