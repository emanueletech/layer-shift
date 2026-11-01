# Game Off 2026 entry (working title)

Entry for [GitHub Game Off 2026](https://itch.io/jam/game-off-2026). Theme: _TBA (1 Nov 2026)_.

## Tech
- [Phaser 3.80](https://phaser.io) (MIT), bundled with esbuild
- All graphics drawn in code and all sound synthesized with WebAudio: no external assets
- Runs in the browser (HTML5), keyboard + mouse + touch

## Build
```bash
npm install
npm run build   # -> dist/index.html, dist/main.js, dist/game-web.zip (itch.io upload)
npm test        # headless Chromium smoke test
```

## Credits
Made by Emanuele Esposito ([Emanuele Tech](https://www.instagram.com/emanuele_tech)).

## License
MIT
