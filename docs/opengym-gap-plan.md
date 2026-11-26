# Closing the gaps with openGym

Source: a read of opengym.ch (home, docs, about, API pages). Their repo was not read.
Each item says what it needs, so the order follows what can ship without touching the server.

## Phase 1 — client only, no backend change (app first, then web)

| # | Feature | Approach |
|---|---------|----------|
| 1 | Keep the screen awake during a workout | `expo-keep-awake` while a session is active and not paused (web: Screen Wake Lock API) |
| 2 | Typo-tolerant exercise search | On-device fuzzy match (edit distance per word) over the 601-exercise catalogue |
| 3 | RIR as well as RPE | Device preference. RIR is stored as RPE (`rpe = 10 - rir`), so no server change |
| 4 | Lift ratios (structural balance) | Compare best estimated 1RMs of squat, bench, deadlift, press and row with a rough reference range; name the weakest link |
| 5 | Year heatmap | One square per day for 52 weeks, shaded by session minutes, built from completed sessions |
| 6 | Bodyweight goal line | Target weight kept on the device, drawn across the bodyweight chart |
| 7 | Share a routine | System share sheet with readable text plus a JSON block |

## Phase 2 — needs backend work (forma-backend repo, DB migrations, its own PRs)

| # | Feature | What the server needs |
|---|---------|-----------------------|
| 8 | Timed sets and cardio | Set fields for duration, distance and speed; a set timer in the app |
| 9 | Edit a saved workout | Edit and delete endpoints for finished sessions, with records recomputed |
| 10 | Custom exercises + own photos or videos | Exercise ownership, media upload with metadata stripped, size limits |
| 11 | Named progression rules (linear, Greyskull LP, double progression, added time) | Per-routine rule, per-exercise override, and "where this target came from" text |
| 12 | Import from Strong, Hevy, FitNotes (+ Apple Health bodyweight) | Back-dated session import endpoint, name matching to the catalogue, merge not overwrite |
| 13 | Strength view on the muscle map | Per-muscle recency and the lifts behind it with 1RM |
| 14 | Bigger exercise library | A licence-checked source. openGym's pictures are not reusable |

## Phase 3 — large or needs a decision first

| # | Feature | Why it waits |
|---|---------|--------------|
| 15 | 26 languages | Needs an i18n layer and reviewed translations, not just machine output |
| 16 | Passkeys | WebAuthn on the server plus native and web sign-in flows |
| 17 | MCP server for asking an AI about your history | Separate read-only package; auth model to decide |
| 18 | Apple Watch app | A native Swift target outside the Expo managed workflow |
| 19 | Self-host docs | The backend has a Dockerfile and compose file; it needs a guide |

## Checks for every item
Typecheck and lint clean, run it in the browser build against a local backend, and say what was not tested.
