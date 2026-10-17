# Browser smoke checklist

Open `index.html` directly from disk (`file://`) in a desktop browser. Open Developer Tools and check the Console for errors. No server or build step should be needed. Run `node test/rules.test.js` separately for the pure rules.

- [ ] The page loads offline with its local Matter.js copy. The score, next-cat preview, rounded container, and pastel cats are visible and readable.
- [ ] Mouse movement aims; clicking drops one cat. A second drop respects the cooldown. The preview advances.
- [ ] Arrow keys aim and Space drops. Aim stays inside the walls for every cat size.
- [ ] On a phone or touch emulator, touch movement aims and releasing drops. Scrolling or zooming does not accidentally drop a cat.
- [ ] Cats fall, roll, come to rest, and remain stable in a crowded pile. Check for excessive jitter or tunnelling through a wall.
- [ ] Two matching cats merge once, pop visibly, increase the score correctly, and can cause a later chain merge. A crowded merge does not throw nearby cats violently.
- [ ] Two Mega Loafs can coexist and merge into a clear celebratory event with the 100-point bonus.
- [ ] A moving or newly dropped cat above the danger line does not immediately end the game. A settled cat staying above it for about one second does. Moving it below the line resets the warning.
- [ ] Game over freezes play and shows the final score. Restart resets the pile, score, timers, and next-cat flow. Best score survives a page reload.
- [ ] Audio is silent before the first gesture, then the lofi loop and generated drop/merge sounds play. The mute button works, survives a reload, and does not restart or multiply the music after repeated gestures.
- [ ] Hiding and restoring the tab pauses and resumes cleanly, without a burst of rapid physics or music notes.
- [ ] At narrow phone width and desktop width, the canvas keeps its aspect ratio, controls remain reachable, and text is legible.
- [ ] Opening `index.html?selftest` reports passing browser rule checks.

Sound quality, cat appeal, touch feel, pile stability, and layout need human judgement in a browser and on a phone. The Node tests cannot verify those experiences.
