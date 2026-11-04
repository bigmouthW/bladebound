**English** | [简体中文](README.zh-CN.md)

# Bladebound

A single-button browser action prototype about flying blades. Three stages built from twelve hand-authored segments, with slice-to-charge energy, charged shield breaks, arrow parries, high-route splits, checkpoints, six between-stage upgrades, and cosmetic unlocks.

## Standalone delivery

Version 0.2.0. Project id: `bladebound-prototype`. Standalone project folder: `bladebound`.

This directory is the complete delivery copy of Bladebound. Use it as the project root for development, builds, and deployment. Keep the top-level `bladebound` folder when unpacking the archive so it stays separate from other games.

| Path | Contents |
| --- | --- |
| `src`, `index.html` | All game source and the entry point, in English and Chinese |
| `public/assets` | Original game art |
| `tests` | Unit tests, browser acceptance tests, and the full-playthrough script |
| `docs` | Game design document, prototype run and acceptance record |
| `dist` | Build output from `npm run build`; not committed by default, ready to serve from any static HTTP server |
| `package.json`, `package-lock.json` | Dependencies and locked versions |
| `deploy` | Nginx config template, deployment notes, and the public check script |
| `THIRD_PARTY_NOTICES.md` | Third-party licenses |

The archive ships no reinstallable `node_modules`, transient logs, or other game projects; the production `dist` already contains everything needed at runtime. Running from source requires Node.js 22 or a compatible version and the `npm ci` step below. Opening `index.html` directly does not work because module loading is blocked, so serve the folder over HTTP.

## Play online

The game starts in English. Pick English or 中文 on the start screen; in-game, switch languages under Settings → Language. The choice is saved in the current browser.

Deployment and update instructions: [deployment notes](deploy/README.md).

## Run

```powershell
npm ci
npm run dev -- --port 4176
```

Run these from this directory. The local address is http://127.0.0.1:4176. The dev server does not open a browser; pick another free port if this one is taken.

```powershell
npm run build
npm test
```

Production files go to `dist`. Headless browser tests:

```powershell
npx playwright install chromium --only-shell
$env:BLADEBOUND_URL='http://127.0.0.1:4176'
npm run test:browser
npm run test:playthrough
npm run test:i18n
```

`BLADEBOUND_BROWSER` can point at any installed Chromium-based browser executable; tests always run headless.

The playthrough script uses the relaxed difficulty and a fixed clock to clear all three stages through input events; it never teleports or alters combat rewards. It is no substitute for human feel and balance testing.

## Design documents

- [Full game design document](docs/bladebound/game-design.md)
- [Prototype run and acceptance](docs/bladebound/acceptance.md)

## Controls

Click the screen, tap the flip button, or press Space to flip. Press P or Escape to pause. Pick one upgrade between stages to continue. Settings, cosmetics, coins, and records are stored in the current browser.

Built with original SVG art, Matter.js, and Lucide. See THIRD_PARTY_NOTICES.md for third-party licenses. There are currently no ads, payments, accounts, or telemetry.
