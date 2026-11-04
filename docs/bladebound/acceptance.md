**English** | [简体中文](acceptance.zh-CN.md)

# Bladebound prototype: running and acceptance

Version 0.2.0  
Date 4 November 2026

## 1 Deliverables

| Item | Location |
| --- | --- |
| Full game design | [Bladebound game design document](./game-design.md) |
| Project overview | [README](../../README.md) |
| Game entry point | [index.html](../../index.html) |
| Source | src/config.js, i18n.js, core.js, levels.js, world.js, renderer.js, main.js, styles.css |
| Local original art | public/assets |
| Automated checks | tests/core.test.mjs, i18n.test.mjs, browser.mjs, i18n.browser.mjs, playthrough.mjs |
| Production build | dist, produced by npm run build |
| Third-party licenses | [THIRD_PARTY_NOTICES](../../THIRD_PARTY_NOTICES.md) |
| Reference game teardown | Three-game technical document (not published with this repository) |

This is a browser prototype that can be played, cleared across three stages, and keeps unlocks saved. Its stages, parameters, and art are independent design work and must not be read as the original implementation of the three reference games.

## 2 Starting up

The local server address for the current workspace is [http://127.0.0.1:4173](http://127.0.0.1:4173). Neither that server nor the verification run opened a game window on the user's desktop.

Once the server has exited, run this from the project root:

```powershell
npm ci
npm run dev -- --port 4173
```

Use Node.js 22 or a compatible version. Installing dependencies needs network access; all game assets are local. The command does not open a browser by itself — pick another free port if this one is taken.

Production build and local preview:

```powershell
npm run build
npm run preview -- --port 4175
```

Production files live in `dist` and need a static HTTP server. Double-clicking `index.html` does not load ES modules or assets correctly. Asset paths are currently rooted at the site root, so deploying into a subdirectory requires adjusting both the Vite `base` and the asset paths.

## 3 Controls

| Action | Input |
| --- | --- |
| Start | Pick standard or relaxed, then click start trial |
| Flip | Click the scene, tap the scene, use the flip button, or press Space |
| Flip again | Press again in the air to reset vertical speed |
| Slice and attack | The blade edge triggers automatically on contact with objects or enemies |
| Charged slash | Released automatically on the next enemy hit once energy is full |
| Pause and resume | Pause button, P, or Escape |
| Between-stage choice | After stages one and two, choose one upgrade each |
| Retry | "Retry this stage" on the fail or pause screen |
| Local settings | Settings entry in the header; sound and reduced motion |
| Language | English / 中文 on the start screen, or the Language menu in settings |
| Cosmetics and records | Blade and trophy icons in the header |

Holding the input does not produce repeated flips. A fall costs one shield and returns the player to the last lantern; running out of shields fails the stage. Retrying keeps the upgrades already chosen and the coins from earlier completed stages.

## 4 Implemented scope

The three stages are Bamboo Shadows, Red Bridge Pursuit, and Mountain Gate Resolve: 12 hand-authored segments, 78 sliceable objects, and 24 enemies including one final boss.

| System | Prototype behaviour |
| --- | --- |
| Physics and input | Matter.js with a fixed 120 Hz step; keyboard, mouse, and touch share the flip action |
| Slicing | Red fruit, green pears, wooden crates, combo scoring, and sliced rigid bodies |
| Combat | Basic hits, full-energy charged slash, shields, heavy enemies, boss, and arrow parries |
| Ragdolls | Enemies turn into six rigid bodies joined by five constraints on death |
| Stages | Spikes, gaps, high routes, and one mid-stage checkpoint per stage |
| Upgrades | Six effects at two levels each; two between-stage three-way choices |
| Economy | Coins settled on stage completion; six blade and trail colour schemes |
| States | Ready, playing, paused, failed, upgrade, final summary |
| Saving | Coins, cosmetics, best score, lifetime stats, and preferences stored in the current browser |
| Language | English by default; English and Simplified Chinese switch instantly across all UI and canvas text |

Refreshing does not restore a stage in progress. Saves are scoped to the browser and site address, so changing browser, port, or clearing site data produces fresh progress.

## 5 Verification method

Basic logic checks:

```powershell
npm test
```

Browser and full-playthrough checks need the dev server running first. They connect to 4173 by default; `BLADEBOUND_URL` can point them somewhere else.

If a Chromium-based browser is already installed, point at it directly and skip installing a test browser. The verification on this machine used:

```powershell
$env:BLADEBOUND_BROWSER='C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
npm run test:browser
npm run test:playthrough
npm run test:i18n
```

Playwright's own headless browser works too:

```powershell
npx playwright install chromium --only-shell
npm run test:browser
npm run test:playthrough
npm run test:i18n
```

Every browser script sets `headless: true` explicitly and never opens a game window on the desktop. Reports and screenshots go to `test-results` and are overwritten on repeat runs.

### 5.1 Check layers

| Layer | Coverage | Result file |
| --- | --- | --- |
| Basic logic | Malformed saves, settlement deduplication, purchases, checkpoints, upgrade caps, stage geometry, combos, geometry helpers | npm test output |
| Page and physics | Input, slice deduplication, real arrow-parry rewards, charged shield breaks, ragdolls, routes, checkpoints, pause, upgrades, boss, settlement, purchase persistence, settings | browser-report.json |
| Viewport fit | 1440×960, 390×844, 360×740, 844×390; non-blank canvas, overflow, touch | desktop-*.png, mobile-*.png |
| Normal run | A page without the qa parameter advances on the real animation clock, and the dev control interface is absent | desktop-realtime.png |
| Localisation | Chinese-locale device defaulting to English, both switch points, preference persistence, mid-run switching, bilingual canvas and upgrade summary, layout in four viewports | i18n-report.json, i18n-*.png |
| Full playthrough | Relaxed difficulty, three stages in one run from the first start, upgrade choices, boss defeated, final summary reached | playthrough-report.json, playthrough-stage-*.png |
| Public deployment | Four viewports in English and Chinese, touch and keyboard, pause, asset loading, caching and gzip, no dev interface in production | deployment-report.json, deployed-en-*.png, deployed-zh-CN-*.png |

Collision cases in the page tests use the dev interface to place the player, inject arrows, and shorten between-stage waits. The playthrough uses a separate script: it dispatches Space events based on hazards and incoming arrows, with no teleporting and no direct edits to damage, shields, or coins; it accelerates simulation with a manually driven fixed clock.

The dev control interface is enabled only in Vite dev mode with `?qa=1` in the URL. Production builds provide no working version of it. The normal-run check separately confirms that a page without the qa parameter can advance.

### 5.2 Results for this round

| Check | Result |
| --- | --- |
| Basic logic | 11 of 11 passed, including language preference, old-save compatibility, and message coverage |
| Browser regression | 17 of 17 passed, zero browser errors, 16 screenshots produced |
| Localisation | All four viewports passed; English default, Chinese preference persistence, mid-run switching, and bilingual coverage all passed with zero errors |
| Viewports | All four verified; no horizontal or vertical page overflow on phone portrait or landscape |
| Three-stage playthrough | Completed; final score 3102, 54 slices, 14 kills, 309 coins |
| Production build | Successful, dist produced; the 0.2 game JS is about 52 KB gzipped |
| Public deployment | 0.2.0 published on port 3392 of a standalone server (address not disclosed here); 4 viewports × 2 languages, 8 scenarios, all passed with zero errors |
| Document links | All 12 local links in the newly delivered documents resolve |

The score, slice count, and kill count from the playthrough are the output of that input script — not an upper bound and not an expected player average. A relaxed-difficulty run proves a completable path exists under the current rules; it says nothing about first-time human clear rates, standard-difficulty balance, or performance on real phones.

The 844×390 landscape viewport uses a compact layout that keeps header, scene, and control bar on one screen, with the settings dialog also inside the viewport. The first-screen canvas check waits for the first animation frame so that the initialising moment is not mistaken for a blank scene.

## 6 Known limits

- Living enemies use a fixed pose and a telegraphed shot; joint physics only applies after death. There is no full draw-and-loose skeletal animation yet.
- All three high routes are implemented and collision-checked, but the continuous run mostly follows the main route and does not cover every route and upgrade combination.
- Cosmetics only change colours; there are no separate blade shapes yet. Sound is short Web Audio synthesis with no real background music.
- Automatic rotation affects hits and arrow parries; feel and forgiveness still need human playtesting.
- Mobile results come from browser viewports and touch emulation and do not yet represent all phone hardware or Safari on real devices.
- There are no ads, payments, accounts, cloud saves, leaderboard backend, or telemetry, and no commercial metrics have been validated.

## 7 Next development order

1. Watch how people handle the first slice, the first obstacle, and the first shielded enemy, then adjust telegraphs, jump forgiveness, and attack pacing.
2. Record standard and relaxed completion separately, along with the failure distribution at each hazard, before touching parameters.
3. Check the real payoff of high routes and the six upgrades, and flesh out combinations that lack a use case.
4. Improve living animation, sound sources, and more hand-authored segments before integrating any target platform SDK.
