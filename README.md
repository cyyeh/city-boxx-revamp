# City Bloxx Revamp

A modern remake of the classic Nokia-era crane-stacking game, built with vanilla HTML5 Canvas. A hook swings on a pendulum cable above the skyline — time your drops to stack floors. Misaligned blocks tilt the tower, and the hook swings faster with every floor. Endless mode: see how high you can go before it all comes down.

**Play it:** open `index.html`, run `make serve`, or deploy to GitHub Pages (instructions below).

## Game design

| Element | Behaviour |
| --- | --- |
| **Hook** | Pendulum swing from a fixed anchor. Angular speed = `√(g/L)`, so as the tower rises and the cable shortens, the hook naturally swings faster. |
| **Speed ramp** | Each successful floor adds a small angular-speed bonus on top (capped so it stays trackable). |
| **Blocks** | Full width on landing — never shrink. Just need a minimum overlap with the previous block. |
| **Slide-off** | If the overlap drops below the minimum, the block tumbles off the side and the next one spawns. |
| **Tilt** | Every offset block adds torque (`offset × height-index`). The whole tower visibly leans and wobbles. |
| **Collapse** | Once cumulative tilt exceeds ~18°, the tower topples in the lean direction. |
| **Tilt meter** | A warning bar appears at the bottom-left of the playfield once tilt crosses 35% of the danger threshold; flashes red near collapse. |
| **Scoring** | Perfect (≤4 px) = 500 · Good (≤14 px) = 200 · Marginal = 50. Perfect drops emit gold sparkles. |
| **Camera** | Auto-scrolls vertically once the tower reaches the upper third of the playfield. |

## Modes & controls

| Mode | Controls |
| --- | --- |
| 1 Player | `↓` Down Arrow — or tap the canvas on mobile — releases the swinging hook |
| 2 Players | P1 = `↓` &middot; P2 = `S` |

In **2P mode** the screen splits — **P1 plays the right half, P2 plays the left half**. The HUD reorders to match (P2 stats left, P1 stats right). Both players race in endless mode; once both towers have toppled, the higher tower wins (score breaks ties).

**Touch devices**: 2P needs a physical keyboard, so the 2P button and hint are auto-hidden on phones and tablets (detected via `(pointer: coarse)` / `(hover: none)`). Even if forced, the game falls back to 1P.

**Portrait phones**: 1P on a portrait viewport runs in a 540×960 logical world (vs. 960×600 in landscape) so the canvas fills the screen and the tower gets more vertical room before the camera scrolls. The swing arc is naturally narrower; everything else (block size, scoring tolerances, tilt threshold) is identical.

Press `Esc` to return to the menu.

## Languages

Full **English / 繁體中文** support, with the toggle in the top-right corner.

- Selection persists across reloads via `localStorage`.
- First visit defaults to **繁中**. Users can switch to EN via the top-right toggle, and the choice is remembered.
- When 繁中 is active, the UI switches to a CJK-friendly font stack (`PingFang TC` / `Microsoft JhengHei` / `Noto Sans TC`…) and sizes are bumped 35–50 % so Chinese characters don't look thin or undersized next to the pixel font.

## Mobile support

The site is built mobile-first:

- `100dvh` layout + iOS safe-area insets — works on notched iPhones.
- **Adaptive logical world**: 1P on a portrait phone gets a 540×960 logical canvas; landscape and 2P stay on 960×600. `game.js` rewrites `canvas.width/height` and the inline `aspect-ratio` at game start so the playfield fills the screen in either orientation — no physical rotation required.
- Canvas uses intrinsic sizing (`max-width: min(100%, 980px)` + `max-height: calc(100dvh - 120px)`), so it scales to whatever aspect the engine chose without distortion.
- Menu uses `justify-content: safe center` + `overflow-y: auto` so every button stays reachable on short viewports (especially 繁中, where fonts are 35–50 % larger).
- `touch-action: manipulation` and pinch-zoom disabled inside the game; `touch-action: none` on the canvas so taps drop blocks cleanly.
- 44–48 px minimum touch targets on every button.
- Adaptive typography via `clamp()`; extra-tight tuning for `≤ 380 px` and landscape phones (`max-height: 480 px`).
- PWA-ready meta tags (`theme-color`, `apple-mobile-web-app-*`, `apple-touch-icon`).

## Running locally

A `Makefile` is included (requires `python3`):

```bash
make serve              # Start static server on http://127.0.0.1:8000
make open               # Start server and open it in your browser
make stop               # Stop the server started by `make open`
make help               # Show all targets
make serve PORT=8080    # Override port
make serve HOST=0.0.0.0 # Bind all interfaces (for LAN play)
```

Or run any static server directly:

```bash
python3 -m http.server 8000
# or
npx serve .
```

Then open <http://localhost:8000>.

## Deploy to GitHub Pages

1. Create a new GitHub repo (e.g. `city-bloxx-revamp`).
2. Push these files to the `main` branch:
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git branch -M main
   git remote add origin https://github.com/<your-username>/city-bloxx-revamp.git
   git push -u origin main
   ```
3. In the repo on GitHub: **Settings → Pages → Build and deployment → Source: Deploy from a branch → Branch: `main` / root → Save**.
4. The game will be live at `https://<your-username>.github.io/city-bloxx-revamp/` within a minute.

The included `.github/workflows/pages.yml` also enables automatic deploys via the GitHub Actions Pages flow if you prefer that route — enable it under **Settings → Pages → Source: GitHub Actions**.

## Files

| File | Purpose |
| --- | --- |
| `index.html` | Markup, screens (menu / game / end), PWA meta tags |
| `style.css` | Retro pixel-art UI, responsive layout, safe-area handling, CJK overrides |
| `game.js` | Canvas engine: pendulum physics, tilt + collapse, scoring, input, camera, particles |
| `i18n.js` | English / 繁體中文 translation layer with `localStorage` persistence |
| `Makefile` | Local-server convenience targets |
| `.github/workflows/pages.yml` | Optional Actions-based Pages deploy |

No build step. No dependencies. Static files only.

## Tuning

Most gameplay knobs live at the top of `game.js`:

| Constant | Effect |
| --- | --- |
| `BLOCK_W` / `BLOCK_H` | Block size in world pixels (default 48 × 48) |
| `LANDSCAPE_W` / `LANDSCAPE_H` | Landscape logical world (960 × 600). Used for 1P landscape and all 2P. |
| `PORTRAIT_W` / `PORTRAIT_H` | Portrait logical world (540 × 960). Auto-selected for 1P on portrait viewports. |
| `PERFECT_TOLERANCE` / `GOOD_TOLERANCE` | Score-tier thresholds in pixels (4 / 14) |
| `PERFECT_BONUS` / `GOOD_POINTS` / `MARGINAL_POINTS` / `FIRST_BLOCK_POINTS` | Point values per tier (500 / 200 / 50 / 200) |
| `MIN_OVERLAP` | Below this, the block slides off entirely |
| `MAX_TILT_RAD` | Topple threshold (~18° / 0.32 rad) |
| `TILT_TORQUE_K` | Sensitivity of tilt to offsets |
| `SWING_ANGLE_CAP` | Max swing amplitude in radians (~60°) |
| `PENDULUM_G` | Tunes base swing frequency via `ω = √(g/L)` |
| `SWING_RAMP_PER_FLOOR` / `SWING_RAMP_MAX` | Endless-mode angular-speed bonus per floor and its ceiling |
| `MIN_CABLE` / `MAX_CABLE` | Cable-length bounds in pixels (80 / 280) |
| `TOWER_TOP_TARGET` | Screen-Y at which the camera starts scrolling |
| `HANG_MARGIN` | Clearance between the hanging block and the tower top |
