# Royal Poker Club server

The authoritative game server for Royal Poker Club. It runs every online table, owns accounts and the free-points ledger, and serves the admin console.

| Path | What |
| --- | --- |
| `/v1/*` | REST API: auth, profile, rewards, history, store, friends, reports, lobby, tournaments, admin |
| `/ws?token=…` | Realtime tables (JOIN_TABLE, PLAYER_ACTION, TABLE_SNAPSHOT, PRIVATE_CARDS, …) |
| `/admin` | Operator console (admin/moderator account + authenticator app) |
| `/health` | Liveness check |
| everything else | The web app from `dist/`, when present |

Rules come from `src/games/poker/engine` (the same engine the app uses for practice), so the client and server can't disagree on poker.

## Run it locally

```bash
npm run server            # builds server/dist/server.mjs and starts it on :8787
npm run dev               # the app on :5173 talks to localhost:8787 automatically
node server/test/integration.mjs   # end-to-end check against the running server
npm run test:poker        # rules engine tests
```

The data lives in `server/data/rpc.sqlite`. Node 24's built-in SQLite is used, so there are no native modules.

## Deploy

Any host that runs a Docker container with a persistent disk works: Render, Railway, Fly.io, a VPS, and so on.

```bash
docker build -f server/Dockerfile -t royal-poker-club .
docker run -p 8787:8787 -v rpc-data:/data --env-file server/.env royal-poker-club
```

1. Copy `server/.env.example` to `server/.env` and set at least `JWT_SECRET`, `CORS_ORIGINS` and `ADMIN_BOOTSTRAP_EMAIL`.
2. Put it behind HTTPS on your domain. Android needs https/wss.
3. Sign up in the app with `ADMIN_BOOTSTRAP_EMAIL`, then open `https://your-domain/admin`. The first login shows an authenticator key to enrol.
4. Back up the `/data` volume (SQLite file plus WAL) daily, and do a restore drill now and then.

### The app

Copy `.env.example` to `.env.production` and set `VITE_RPC_SERVER=https://your-domain`. Then rebuild the web app and the APK the usual way (`npm run build`, `npx cap sync android`, then the Gradle build).

## Things only you can set up

| Feature | What to create | Where it goes |
| --- | --- | --- |
| Google sign-in | Google Cloud OAuth client IDs: a **Web** one, plus an **Android** one with your upload and Play signing SHA-1 | Server `GOOGLE_CLIENT_IDS` (web id), app `VITE_GOOGLE_WEB_CLIENT_ID` |
| Apple sign-in | Apple Developer Services ID | Server `APPLE_CLIENT_IDS`, app `VITE_APPLE_CLIENT_ID` |
| Facebook sign-in | Meta app (Facebook Login) | Server `FACEBOOK_APP_ID` and `FACEBOOK_APP_SECRET`, app `VITE_FACEBOOK_APP_ID`, plus `facebook_app_id`/`facebook_client_token` in Android `strings.xml` |
| Cosmetics and VIP purchases | In Play Console, one-time products `rpc_felt_crimson`, `rpc_back_sapphire`, `rpc_frame_ruby`, `rpc_theme_emerald`, and the subscription `rpc_vip_monthly` (base plan `monthly`). Plus a service account with Play Console access | Server `PLAY_SERVICE_ACCOUNT_JSON` |
| Refund handling | Real-time developer notifications: a Pub/Sub topic with a push subscription to `/v1/purchases/rtdn?token=RTDN_TOKEN` | Server `RTDN_TOKEN` |

Until a provider is configured, its button explains it isn't switched on, and the Shop says purchases happen in the Android app.

## Points and India rules

- Points are free: a starter grant, daily and video bonuses, missions, level-ups and tournament prizes.
- Points move only through the `ledger` table. Every entry is unique per (user, type, correlation id). Hands settle once, using the hand id. The balance can't go negative.
- A nightly reconciliation compares balances with ledger sums and opens a review ticket for any mismatch.
- There are no endpoints that sell, transfer or redeem points. The store sells cosmetics and VIP only.
