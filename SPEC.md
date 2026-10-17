# cat-stack — spec

A Suika / "watermelon game" style stacker: drop round things into a container; two of the same kind that touch merge into the next, bigger kind; the game ends when the pile overflows the top line. Ours uses **squishmallow-style stuffed cats**: round, soft, pastel, big cheeks, tiny closed eyes, little ears.

## Must have
- **Playable in a browser from a single `index.html`** opened from disk (file://) with no build step. A CDN script tag for a physics library is fine; vendoring the library file next to index.html is better (offline). No server.
- **Proper 2D physics** via an existing engine (Matter.js or Planck.js — pick one and say why): gravity, rolling, resting friction, restitution tuned so cats feel plush (slight squash on landing is a nice-to-have).
- **Core loop:** show the next cat at the top, move with mouse/touch/arrow keys, drop with click/tap/space; cooldown between drops; merging on contact of equal kinds with a little pop; score (standard Suika scoring is fine); game over when a resting cat stays above the top line for ~1 s; restart button; best score in localStorage.
- **A ladder of at least 8 cat kinds**, each a distinct pastel colour and size, drawn **procedurally on canvas** (no image files): body, ears, cheeks, eyes, maybe a tiny bow or patch on the bigger ones. The biggest merge should feel like an event.
- **Cute lofi music loop, generated with the Web Audio API** (no audio files): slow tempo (~70–80 BPM), swung hi-hats or soft brush, warm chords (e.g. ii–V–I in a major key with 7ths/9ths), a simple melodic motif, light vinyl-crackle noise, low-pass filtered. Mute toggle; starts only after the first user gesture (browser autoplay rules). Small sound effects for drop and merge, also synthesised.
- **Looks finished:** pastel background, rounded container, readable score and "next" preview, works at phone and desktop sizes (scale the canvas, keep aspect).

## Constraints
- **Assets:** only what you draw or synthesise. No copyrighted images, sprites or music. If you borrow code from a repo, it must be MIT/BSD/Apache/CC0 and credited in a `CREDITS.md`.
- Keep it to a few files: `index.html`, `game.js`, `audio.js`, `cats.js` (or similar), plus the vendored physics library and `CREDITS.md`. Plain JS, no framework, no bundler.
- Don't commit; the human commits after review.
- Test what you can without a browser (e.g. the merge ladder and scoring as pure functions with a tiny `node` test or an in-page self-check), and state clearly what still needs a human to look at.

## Nice to have (only if cheap)
- Squash-and-stretch on landing/merge; particles on merge; a gentle idle wobble; haptic-feeling screen nudge on big merges; pause when the tab is hidden.
