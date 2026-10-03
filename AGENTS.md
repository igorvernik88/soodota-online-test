# Editing Sudota

- Start with `npm run context -- <area>`: hud, input, animations, skills, combat, puzzles, world, economy, bots, build. It prints owners, search symbols and focused checks. Read relevant functions, not whole large files.
- For a CSS selector, use `npm run context -- --find .action-bar` (substitute the selector). Results follow cascade order. `style.css` is the import entry; edit the matching file in `styles/`. Preserve import/rule order and responsive conditions. Change the owning rule rather than appending another override.
- Animation sizes, timing and frame crops live in `src/animations/<role>.js`: agile = Шустрик, intellect = Интеллектуал, strong = Дырокол. `manifest.js` owns shared settings and assets; `src/hero-animation.js` chooses states and draws frames.
- Keep gameplay rules in the model; UI projects state. Preserve keyed DOM updates (`src/ui/dom.js`), independent Sudoku pages and seeded randomness.
- Declare affected source files and preserve unrelated working changes. Use the scope helper supplied with `$sudota-scoped-edits`; its script lives in the skill folder, not this repository.
- `sudota.html` is generated. Build once after final source edits with `npm run build`; do not inspect/edit its minified contents for ordinary work. PNG originals stay in `assets/`.
- Format only touched authored files. Run relevant existing checks for logic/refactors; use build and source review for small cosmetic edits. Browser playtests are manual in this project unless the user requests automation. Do not run simulations for cosmetic changes.
- If a test fails before edits, record it; do not change gameplay to satisfy a stale expectation. Tests that read CSS should bundle `style.css` with esbuild to include imports.
