# Knight's Realm — Official Website

The presentation website for **Knight's Realm**, a pixel-art real-time strategy game.
Hosted with GitHub Pages at <https://knightsrealm.github.io>.

## Structure

```
index.html            Main presentation page (hero + trailer, the game,
                      soundtrack, news teaser)
news.html             News / devlog posts
about.html            About the game & developer + FAQ + contact
press.html            Press kit (factsheet, descriptions, asset downloads)
privacy.html          Privacy policy
404.html              "Off the map" error page (served automatically by Pages)
assets/css/style.css  Design system & all component styles
assets/js/links.js    ⭐ All external links, trailer id & contact email (see below)
assets/js/main.js     Nav, scroll-reveal, trailer facade, audio players
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

## The trailer

The hero player is a **click-to-play facade**: the poster and play button are ours,
and nothing is requested from YouTube until a visitor actually presses play (then a
`youtube-nocookie.com` embed is swapped in). The video id lives in `links.js` as
`trailerId` — currently a **placeholder** (Blender's CC-BY "Big Buck Bunny").

To ship the real trailer: set `trailerId` in `assets/js/links.js`, then delete the
`<span class="trailer-tag">Placeholder trailer</span>` line from `index.html`.

The poster uses the key art, scaled and shifted in CSS (`.trailer-poster`) because the
source JPG has Steam store chrome baked into its top band that must stay out of frame.

## Development

No build step — it's plain HTML/CSS/JS. Serve locally with any static server, e.g.:

```sh
python3 -m http.server 8000
```

then open <http://localhost:8000>.
