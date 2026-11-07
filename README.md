# VIBO — game collection

A React + TypeScript + Vite game hub that ships as a web app and as an Android app (Capacitor, package `com.Vibo.myvibo`), plus a Node game server for the online poker club.

## Games

| Folder (`src/games/`) | Game |
| --- | --- |
| `ludo` | Ludo for 2–6 players, with a neon-city 3D board |
| `city` | City: property trading board game |
| `wildbound` | Wildbound: Deep Forest Run endless runner (also built as a standalone app) |
| `amazon` | Amazon Wild Run |
| `poker` | Royal Poker Club: Texas Hold'em (practice + online via `server/`) |
| `mystery`, `mysteryWild` | Mystery detective games |
| `mess`, `messWithFriend` | Party mini-games |

The social layer (`src/social`) provides friends, DMs, parties and voice over PeerJS peer-to-peer connections.

## Requirements

- Node.js 24+
- For Android builds: JDK 21 and the Android SDK (platform 36)

## Scripts

```bash
npm install
npm run dev              # dev server on http://localhost:5173
npm run build            # type-check + production build to dist/
npm run lint             # oxlint
npm run test:poker       # poker rules engine tests
npm run test:wildbound   # Wildbound engine tests
npm run server           # build + start the poker game server on :8787
npm run server:check     # type-check the server
```

Standalone Wildbound web build: `npx vite build -c vite.wildbound.config.ts` (output in `dist-wildbound/`).

## Configuration

Copy `.env.example` to `.env.production` for app build settings, and `server/.env.example` to `server/.env` for the server. **Never commit real `.env` files, keystores or `keystore.properties`.** They are git-ignored.

In production (`NODE_ENV=production`), the server refuses to start unless `JWT_SECRET` is a real random value of at least 32 characters.

## Android

```bash
npm run build
npx cap sync android
cd android && ./gradlew bundleRelease   # needs keystore.properties outside the repo for signing
```

Release signing reads `keystore.properties` from outside the repository (see `android/app/build.gradle`). Bump `versionCode`/`versionName` in that file before each Play upload.

## Server deployment

See [server/README.md](server/README.md). The quick version:

```bash
docker build -f server/Dockerfile -t royal-poker-club .
docker run -p 8787:8787 -v rpc-data:/data --env-file server/.env royal-poker-club
```

## Before Play Store production

- Replace Google's test AdMob IDs (`VITE_ADMOB_*` and `admob_app_id` in `android/app/src/main/res/values/strings.xml`) with real ones.
- Set `VITE_SUPPORT_EMAIL` for player reports.

## Not in this repository

`unreal_assets/` (about 2.7 GB of raw Unreal and 3D source files) is kept locally only.
