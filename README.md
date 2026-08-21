# GpsLocationTracer

Self-hosted location history tracker for Google Maps location sharing. Polls Google's
internal location-sharing endpoint with your own session cookies, stores every update in
Postgres, and visualizes live positions plus per-day traces on a self-hosted offline map
of Bangalore.

```
Caddy (TLS) ──▶ Next.js web (UI + API) ──▶ PostgreSQL 16 + PostGIS
                     ▲                        ▲
              poller worker (every 5 min) ───┘
                     │
                     ▼
     google.com/maps/rpc/locationsharing/read
```

## Important constraints (read first)

- **No official API.** Google does not expose an API for reading other people's shared
  locations. This app uses the same unofficial endpoint as Home Assistant's Google Maps
  integration, authenticated with your exported session cookies. It can break at any
  time and is a ToS gray area.
- **No historical backfill.** Google only returns each person's *current* position.
  History accumulates from the moment the worker starts polling.
- **Cookies expire** every few weeks to months. The UI shows a red banner when that
  happens; re-export and re-upload cookies.txt in Settings.

## Stack

| Layer | Choice |
|---|---|
| Web | Next.js 15 (App Router), TypeScript, Tailwind CSS 4 |
| DB | PostgreSQL 16 + PostGIS (docker image `postgis/postgis`) |
| ORM | Drizzle ORM + drizzle-kit migrations |
| Poller | TypeScript worker (`tsx`), fixed interval + jitter |
| Map | MapLibre GL JS + Protomaps PMTiles (offline `.pmtiles` of Bangalore) |
| Auth | Single password (`APP_PASSWORD`) + signed iron-session cookie behind HTTPS |
| Deploy | Docker Compose: `caddy` + `web` + `worker` + `db` + nightly `pg_dump` sidecar |

## Repo layout

```
apps/web            Next.js UI + API routes + tiles file server (HTTP Range support)
apps/worker         5-min poller: fetch -> parse -> dedupe -> insert
packages/db         Drizzle schema, client, migrations
packages/gmaps-client  Cookie parsing/AES-GCM encryption + RPC fetch/parser
scripts/build-tiles.sh  Download + extract the offline Bangalore basemap
tiles/              bangalore.pmtiles lives here (gitignored, volume-mounted)
```

## Local development

Prereqs: Node 22+, pnpm (`npm i -g pnpm`), Docker (for Postgres) or any Postgres 16.

```bash
cp .env.example .env
# edit .env: set APP_PASSWORD and SESSION_SECRET (openssl rand -hex 32)

docker run -d --name gpstracer-db -p 5432:5432 \
  -e POSTGRES_USER=gps -e POSTGRES_PASSWORD=gps -e POSTGRES_DB=gpstracer \
  postgis/postgis:16-3.4

pnpm install
pnpm db:migrate          # applies drizzle migrations
pnpm dev:worker          # poller (first poll ~5s after boot)
pnpm dev:web             # http://localhost:3000
```

Then open http://localhost:3000, log in with `APP_PASSWORD`, go to **Settings** and
upload your `cookies.txt` (see below). Within one poll interval the dashboard shows
live positions.

## Getting your cookies.txt

1. Log in to **your** Google account (the one people share location *with*) at
   https://www.google.com/maps in Chrome/Firefox.
2. Install **Get cookies.txt LOCALLY** (Chrome) or **Export cookies** (Firefox).
3. While on google.com, export the cookies for `.google.com`.
4. Upload the file in the app under Settings (or paste its contents). Cookies are
   AES-256-GCM encrypted before being stored.

Notes:
- Do not sign out of the session you exported from — that invalidates the cookies.
- Required cookie names include `__Secure-1PSID`; validation happens on upload and on
  the next poll.

## Offline basemap (Bangalore PMTiles)

The map prefers a self-hosted Protomaps vector tile file; if missing it falls back to
online OSM raster tiles (with a warning banner).

```bash
scripts/build-tiles.sh              # today's build, bbox ~Bangalore + 5km
# or pick a date / custom bbox:
BBOX=77.25,12.75,77.95,13.35 scripts/build-tiles.sh 2026-08-20
```

Requires only `npx pmtiles` (auto-installed). Result: `tiles/bangalore.pmtiles`
(~50–100 MB). In production it is mounted into the web container and served at
`/tiles/bangalore.pmtiles` with Range support. Label fonts load from Protomaps' public
font CDN; everything else stays local.

Set `NEXT_PUBLIC_MAP_STYLE=osm` to skip PMTiles entirely.

## Production deploy (Ubuntu VPS)

```bash
git clone <your-repo> && cd GpsLocationTracer
cp .env.example .env
nano .env    # APP_PASSWORD, SESSION_SECRET, DOMAIN, ACME_EMAIL, POSTGRES_PASSWORD

docker compose up -d --build
```

- Caddy terminates TLS and gets Let's Encrypt certificates automatically for `$DOMAIN`
  (point an A record at the VPS first). For LAN-only testing set `DOMAIN=localhost`.
- Migrations run automatically when the worker boots.
- Nightly `pg_dump` lands in `./backups/`, 14-day retention.
- Update: `git pull && docker compose up -d --build`.

Restore a backup:

```bash
gunzip -c backups/gpstracer-2026-08-21.sql.gz | \
  docker compose exec -T db psql -U gps gpstracer
```

## Features

- **Live dashboard** — latest position per person, auto-refresh 30 s, address, battery,
  charging, stale badge after 15 min.
- **History** — pick date + time range + people; per-person colored polylines, raw
  point dots, numbered stop markers (stayed ≥10 min within 75 m), playback animation
  with scrubber and 1x/60x/300x/900x speed.
- **Filters are server-side** — SQL between `recorded_at` bounds (IST via `TZ_OFFSET`).
- **Dedupe** — a point is stored only if it differs from the last reading (>50 m or
  ≥5 min newer), keeping stationary periods compact.
- **Sync health** — Settings shows last poll, recent runs, errors; red banner when the
  Google session goes invalid.

## Configuration reference

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Postgres connection string |
| `APP_PASSWORD` | Single login password for the web UI |
| `SESSION_SECRET` | ≥32 chars; signs the session cookie + encrypts stored cookies |
| `POLL_INTERVAL_SECONDS` | Worker poll interval (default 300) |
| `TZ_OFFSET` | Offset used for date filters (default `+05:30`) |
| `GOOGLE_EMAIL` | Optional: also track the authenticated account itself |
| `NEXT_PUBLIC_MAP_STYLE` | `pmtiles` (default) or `osm` fallback (build-time) |
| `NEXT_PUBLIC_MAP_CENTER_*`, `NEXT_PUBLIC_MAP_ZOOM` | Initial viewport (build-time) |
| `TILES_PATH` | Server dir served under `/tiles` (default `./tiles`) |

## Known risks

- Unofficial endpoint may change; parser is isolated in `packages/gmaps-client`.
- Aggressive polling could get flagged; keep the default 5-min interval (jittered).
- Cookie handling means full account access if leaked — keep `SESSION_SECRET` secret,
  always use HTTPS, and re-export cookies only from a trusted machine.
