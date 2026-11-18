# Forma — Mobile

Expo (SDK 58) + expo-router app that mirrors the Forma website (`forma` repo) and talks to `forma-backend`.

```bash
cp .env.example .env     # set EXPO_PUBLIC_API_URL (use your LAN IP on a physical device)
npm install
npx expo start
npm run typecheck
```

## Structure

- `app/` — routes only. `(auth)` login/signup/forgot/verify, `(tabs)` home · training · nutrition · trainer · more
- `src/theme/tokens.ts` — the website's `tokens.css`, ported 1:1
- `src/components/ui/` — surfaces (soft / raised / recessed / glass), text, controls
- `src/api/` — `types.ts` and `client.ts` ported from the website; tokens live in the keychain
- `.agents/skills/` — Expo's official agent skills

## Parity with the website

Ported (API-backed, same endpoints as the web app): auth, onboarding, home dashboard, training hub
(today / calendar / history / templates + presets), workout builder, active workout (set logging, adaptive rest,
swap, plate calculator, summary + PRs), progress, body map, records & achievements, goals, store, exercise library,
trainer chat + insights, nutrition (food log, search, barcode, goals), notifications, and all settings panels
(training, coaching, connections, notifications, appearance, customization, privacy, account, security),
plus the theme engine (10 themes, accents, light/dark/system).

Not yet ported: camera form tracking, voice chat, progress photos, programs (week schedule) UI, Apple Health /
Health Connect sync (needs a dev build + `forma/mobile` health code), ambient theme effects (particles, scanlines),
the anatomical SVG body map (a schematic diagram is used), Apple/Google social sign-in, motion polish.
