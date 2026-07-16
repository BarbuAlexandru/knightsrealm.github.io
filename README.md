# Knight's Realm — Official Website

The presentation website for **Knight's Realm**, a pixel-art real-time strategy game.
Hosted with GitHub Pages at <https://knightsrealm.github.io>.

## Structure

```
index.html            Main presentation page (hero, features, units, enemies,
                      buildings, world, soundtrack, news teaser)
news.html             News / devlog posts
about.html            About the game & developer + FAQ + contact
press.html            Press kit (factsheet, descriptions, asset downloads)
privacy.html          Privacy policy
404.html              "Off the map" error page (served automatically by Pages)
assets/css/style.css  Design system & all component styles
assets/js/links.js    ⭐ All external links & contact email (see below)
assets/js/sprites.js  Spritesheet animation engine
assets/js/main.js     Nav, scroll-reveal, team switcher, audio players
art/                  Game art & audio, referenced directly by the site
DOCUMENTATION.md      Game design/state reference (not part of the site)
```

## Updating store & social links

All buttons across the site read from **`assets/js/links.js`**. When a store page or
social profile goes live, fill in its `url` there — placeholders automatically become
working buttons on every page. The contact email placeholder lives in the same file.

## Adding a news post

1. Open `news.html`, copy an existing `<article class="post">…</article>` block and
   edit its `id`, date, title and paragraphs (newest post goes on top).
2. Optionally update the three "Latest news" teaser cards near the bottom of
   `index.html` to feature it.

## Animated sprites

Any element like:

```html
<div class="sprite" data-sheet="art/…png" data-cols="6" data-rows="8"
     data-row="0" data-from="0" data-count="6" data-fps="8" data-scale="0.5"></div>
```

plays frames `from … from+count-1` of grid row `row` from the given spritesheet.
Sprites pause off-screen and freeze for visitors who prefer reduced motion.

## Development

No build step — it's plain HTML/CSS/JS. Serve locally with any static server, e.g.:

```sh
python3 -m http.server 8000
```

then open <http://localhost:8000>.
