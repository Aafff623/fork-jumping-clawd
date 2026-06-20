# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

Jumping Clawd is a browser extension mini-game built with [WXT](https://wxt.dev/). It can launch as an overlay on the current page or as a standalone game page on blank/new-tab pages. The game is implemented in vanilla JavaScript; extension entrypoints and utilities use TypeScript.

## Development commands

Requires Node.js `>=20.12.0` and npm. Install dependencies with:

```bash
npm install
```

WXT runs `wxt prepare` in `postinstall` to generate the `.wxt/` directory (local generated files; do not commit).

Available npm scripts:

```bash
npm run dev              # Chrome/Chromium development build with HMR
npm run dev:firefox      # Firefox development build with HMR
npm run compile          # Type-only check: tsc --noEmit
npm run build            # Production build for Chrome/Chromium
npm run build:firefox    # Production build for Firefox
npm run zip              # Package extension zip for Chrome/Chromium
npm run zip:firefox      # Package extension zip for Firefox
```

There is currently no test runner or linter configured. Verification is done manually by loading the extension in a browser after `npm run dev`.

## Entrypoints and architecture

WXT picks up entrypoints from the `entrypoints/` directory:

- `background.ts` — service worker. Listens for extension keyboard commands (`Ctrl+,` casual, `Ctrl+.` challenge) and opens the game in the active tab.
- `popup/` — browser-action popup UI (`index.html`, `main.ts`, `style.css`). Shows shortcuts, mode buttons, an exit button, and a backdrop-blur slider.
- `page-game-overlay.ts` — unlisted content script injected into web pages. Creates a full-page shadow-DOM overlay with an iframe pointing to `game.html`, handles iframe ↔ page messaging, locks page scroll, blocks page input while open, samples page background to choose a light/dark surface theme, and listens for in-page shortcuts (Esc to close, Ctrl+A to toggle auto-play).
- `game.html` — the game page, loaded both standalone and inside the overlay iframe. Includes `src/game/app.js` and `src/game/styles.css`.

Extension-side shared code lives in `src/extension/`:

- `open-game.ts` — decides whether to open the game as a standalone tab (on `about:blank`, new-tab pages, etc.) or as an overlay in the current tab, and injects the content script when needed.
- `messages.ts` — message type constants and `GameMode` types shared between background, popup, and content script.
- `backdrop-blur.ts` — reads/writes the backdrop blur setting via `browser.storage.local`.

Game code lives in `src/game/`:

- `app.js` — main game loop, state machine (`ready` → `charging` → `jumping` → `dead`/`respawning`/`game-over`), input handling, platform generation, scoring, collision resolution, auto-play logic, and leaderboard UI wiring.
- `clawd-motion.js` — frame-based Clawd animation: anticipation, jump arc, hangtime, landing squash/stretch, arm swing, velocity stretch, and takeoff smear.
- `config.js` — tunable constants for sizes, animation timing, charge meter, platform spacing, spikes, death animations, and mode-specific parameters.
- `dom.js` — DOM element lookups and the game-over modal markup.
- `leaderboard.js` — Supabase REST client for fetching and upserting leaderboard entries.
- `math.js` — small math helpers (lerp, easing, vectors, randomness).
- `styles.css` — all game visuals.

## Key behavioral details

- **Game modes:** `casual` and `challenge`. Casual respawns on death; challenge shows a game-over leaderboard and has rising bottom spikes plus downward camera drift that increases over time.
- **Input:** Space to charge and release to jump. Esc closes the overlay. Ctrl+A toggles auto-play.
- **Auto-play:** Computes a safe power range from the current/target platform geometry and releases automatically; in challenge mode it also simulates the jump path to avoid falling into the bottom spikes.
- **Surface theme:** When running as an overlay, `page-game-overlay.ts` samples the host page background and passes `surface=light|dark` to `game.html` via query string. Standalone pages default to light.
- **Leaderboard:** Uses Supabase (`xletejbcfylwplhnlbjo.supabase.co`) with a publishable key. `wxt.config.ts` declares the matching `host_permissions`. The table is `leaderboard_entries` and the upsert is done via the `upsert_leaderboard_entry` RPC.

## Files to know when modifying specific behavior

| Change | Start here |
| --- | --- |
| Platform distances, jump timing, sizes, colors, mode parameters | `src/game/config.js` |
| Character animation, stretch, smear, arm swing | `src/game/clawd-motion.js` |
| Game state, input, collision, scoring, respawn, game-over | `src/game/app.js` |
| Game visuals | `src/game/styles.css` |
| How the game opens (overlay vs standalone tab) | `src/extension/open-game.ts` |
| Overlay behavior, page injection, iframe communication, shortcuts | `entrypoints/page-game-overlay.ts` |
| Popup UI and settings | `entrypoints/popup/main.ts` |
| Extension manifest, permissions, shortcuts, web-accessible resources | `wxt.config.ts` |
| Leaderboard REST endpoint or fields | `src/game/leaderboard.js` |

## Generated files

Do not commit `.wxt/`, `.output/`, `out/`, or `node_modules/`. These are already ignored by `.gitignore`.

## Agent skills

### Issue tracker

Issues live as GitHub issues in this repo. Use the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

Use the canonical five labels as-is: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context repo: one `CONTEXT.md` + `docs/adr/` at the repo root. See `docs/agents/domain.md`.
