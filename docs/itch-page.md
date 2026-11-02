# itch.io page and jam submission

Everything needed to publish LAYER SHIFT on itch.io and submit it to GitHub Game Off 2026.
**Deadline: 1 December, 22:37** (submit a day early: itch.io gets slow in the last hours).

## 1. Build the upload

```bash
npm ci
npm run build    # dist/game-web.zip
npm test
```

## 2. Create the project (itch.io > Dashboard > Create new project)

| Field | Value |
|---|---|
| Title | LAYER SHIFT |
| Project URL | `layer-shift` |
| Short description / tagline | Fix every 3D-printed layer before it hits the plate, with nothing but the two Shift keys. |
| Classification | Games |
| Kind of project | HTML |
| Release status | Released |
| Pricing | No payments (or "$0 or donate") |
| Upload | `dist/game-web.zip`, tick **This file will be played in the browser** |
| Embed options | Embed in page · viewport **960 × 540** · tick **Mobile friendly** (orientation: landscape) · tick **Automatically start on page load** off · tick **Fullscreen button** |
| Frame options | tick **Click to launch in fullscreen** off (the game scales itself) |
| Genre | Puzzle (secondary: Action) |
| Tags | `3d-printing`, `one-button`, `arcade`, `puzzle`, `timing`, `game-off`, `retro`, `short` |
| AI generation disclosure | answer truthfully for the code, graphics and sound of the project |
| App store links / source | Source code: https://github.com/emanueletech/layer-shift |
| Input | Keyboard, Touchscreen, Mouse |
| Accessibility | One-handed play possible (arrow keys or A / D); short screen-shake and pixel-glitch effects on mistakes |
| Cover image | `docs/media/cover.png` (630 × 500) |
| Screenshots | `docs/media/title.png`, `gameplay.png`, `plate-shift.png`, `liftoff.png` |
| Gameplay video / GIF | `docs/media/gameplay.gif` (can also go at the top of the description) |

### Theme (Edit theme)

Background `#06080d`, text `#e6edf6`, links `#5cff95`, buttons `#2ee66b`, font Poppins.

## 3. Description (paste into the itch.io editor)

> **Every layer comes out of the nozzle misaligned.**
> Shift it back into place before it hits the plate, using nothing but the two Shift keys.
>
> It is night shift at the print farm: eight jobs in the queue between 22:00 and 06:00, from a calibration cube to a rocket that might just fly if you print it clean.
>
> **Four kinds of SHIFT**
> - **Layer shift:** the 3D-printing failure where layers slide out of place. Here, you fix it live. From job 5 the build plate itself slips mid-job: the part slides away and you have to chase it.
> - **Shift keys:** the whole game is played with Left Shift and Right Shift.
> - **Bit shift:** every layer is a row of filament bits. Push one past the edge and it is gone for good.
> - **Night shift:** finish the queue before sunrise.
>
> **Controls**
> - Left Shift / Right Shift: shift the layer (arrow keys and A / D work too)
> - Both Shifts together: drop the layer now
> - P or Esc: pause · M: sound
> - Phone or tablet (landscape): tap left / right of the printer, DROP or two fingers to print
>
> Filament printed over air sags into spaghetti, filament in the wrong place turns red, clean layers in a row build a combo.
>
> No asset files: every graphic is drawn in code and every sound, music included, is synthesized live with WebAudio.
>
> Made by Emanuele Esposito · Emanuele Tech for GitHub Game Off 2026 (theme: SHIFT).
> Source code (MIT): https://github.com/emanueletech/layer-shift

## 4. Submit to the jam

1. Save the project as **Public** (a draft cannot be submitted) and open it once in a private window: check sound, keyboard and fullscreen.
2. Test on a phone in landscape: tap to start, tap the sides, DROP, results buttons.
3. Go to https://itch.io/jam/game-off-2026 > **Submit your project** > pick LAYER SHIFT.
4. Fill the submission fields: GitHub repository URL `https://github.com/emanueletech/layer-shift` (the jam requires a public repo created during the jam), short explanation of how the theme is used (use the "Four kinds of SHIFT" list).
5. Submit, then open the entry page and check that the game runs from there.
6. Make sure the repository is **public** and `main` has the final build and README.

## 5. After submitting

- Pin the itch.io link in the repo's "About" box (Website field).
- Share the GIF (`docs/media/gameplay.gif`) with the itch.io link.
- Rate and comment other entries: it helps your own entry get played.
