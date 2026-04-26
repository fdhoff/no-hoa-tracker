# CLAUDE.md

Notes for Claude agents working on this project. The README is for humans; this file is for context that helps you avoid common mistakes.

## What this is

A single-user personal tracker for no-HOA home listings, used by the project owner to track candidate properties they're evaluating to buy. Currently focused on Henderson, NV and Tennessee but built to work for any US state. Redfin is the preferred browsing platform; MLS# is the canonical dedup key.

## Running it

```
npm install
npm start    # Express server on :8000, serves UI + REST API
```

The server **must be running on `http://localhost`** for the bookmarklet flow to work — bookmarklets can't open `file://` URLs. If the user reports the bookmarklet "doesn't do anything," ask whether `npm start` is running.

## Architecture (one-line tour)

| File | Role |
|---|---|
| `server.js` | Express + better-sqlite3, ~85 lines. Static file server for the frontend, plus REST API at `/api/*`. WAL-mode SQLite. |
| `app.js` | Vanilla JS frontend. Has a `Storage` abstraction that talks to the API when reachable, falls back to `localStorage` otherwise. |
| `index.html` / `styles.css` | UI. Dark-themed grid of listing cards + modal form. |
| `bookmarklet.html` | Install page for the Redfin scraper bookmarklet. Configurable tracker URL, generates the `javascript:` href on the fly. |
| `bookmarklet-src.js` | Readable source of the bookmarklet (kept in sync with the minified inline version in `bookmarklet.html`). |
| `data/listings.db` | SQLite database (gitignored, created on first server run). |

## Data shape

```
{
  id: string,            // generated client-side: timestamp + random
  mls: string,           // canonical identifier — used for dedup
  address, city: string,
  state: string,         // 2-letter US state code
  status: 'reviewed' | 'interested' | 'contacted' | 'viewed' | 'offer' | 'under-contract' | 'passed',
  price, beds, baths, sqft, lotSize: number | null,
  yearBuilt: integer | null,
  url: string,           // typically a Redfin listing URL
  hoaConfirmed: 'yes' | 'unverified' | 'has-hoa',
  notes: string,
  dateAdded, lastChecked: ms-epoch integer,
}
```

The SQLite schema in `server.js` mirrors this exactly — JSON in, JSON out.

## REST API

```
GET  /api/health             -> {ok, count}
GET  /api/listings           -> [Listing]
PUT  /api/listings/:id       -> Listing  (upsert, body is the full record)
POST /api/listings           -> Listing  (upsert, id required in body)
DELETE /api/listings/:id     -> {deleted: number}
POST /api/listings/bulk      -> {inserted: number}   (transactional)
```

## Things to know before editing

1. **Status values are spread across multiple files.** If you add or rename one, update: `STATUS_LABELS` in `app.js`, the `<option>` lists in `index.html` (filter dropdown + form dropdown), and the `.badge-<status>` rules in `styles.css`. There's no enum source-of-truth — be thorough.

2. **Schema migration is in `migrate(l)` in `app.js`.** v1 used a `region` enum (`henderson-nv` | `tennessee`); v2 uses `state` + `city`. Keep this function backwards-compatible — old JSON exports still get imported through it.

3. **The bookmarklet is duplicated.** `bookmarklet-src.js` is the readable version; `bookmarklet.html` has a minified inline version embedded as a JS string with `__TRACKER_URL__` placeholder. **When you edit one, edit both.** They drift easily.

4. **Pinned regions are user-configurable.** `PINNED_REGIONS` at the top of `app.js` controls the one-click Redfin buttons. The user picked Henderson, NV and Tennessee as their focus; don't hardcode anything else there without asking.

5. **Frontend writes are optimistic.** `handleSubmit` and `deleteListing` update the in-memory `listings` array first, then call `Storage.upsert/remove`. On failure they alert. There's no retry queue — if you add background sync, design it carefully.

6. **localStorage is fallback only.** When the backend is reachable (`Storage.mode === 'api'`), the source of truth is SQLite. The "Sync localStorage →" button copies from local to SQLite for users who upgraded from the localStorage-only era.

## User preferences (keep in mind)

- **Generalize, then pin defaults.** When the user describes a narrow current scope (Henderson + TN), build the underlying structure to handle anywhere in the US, then surface their current focus as defaults/pinned shortcuts. Don't hardcode the narrow case. (See feedback memory `feedback_prefer_flexible.md`.)
- **Local over cloud.** They picked SQLite over Supabase for the backend. Don't suggest cloud-hosted alternatives unless asked.
- **Redfin first.** Redfin is the canonical browsing platform. Zillow / Realtor.com integrations are not on the roadmap unless the user asks.

## Known unfinished directions (discussed but not built)

- **Auto-populated listings via paid API.** RapidAPI's Realtor endpoint or ATTOM was discussed as a way to skip manual entry. Not wired up. If the user picks this up, the ingest path is `Storage.bulkUpsert(items)`.
- **Map view + photos.** Once listings have lat/lng + image URLs (which would come from a listings API), Leaflet/Mapbox + a photo grid would be the natural next step.
- **Mobile / PWA.** Discussed as a use-it-from-the-car upgrade, not implemented.

## Testing

There are no automated tests yet. Smoke-test by:
1. `npm start` — server should log "Listings in DB: N"
2. `curl http://localhost:8000/api/health` → expects `{ok:true, count:N}`
3. Open `http://localhost:8000` — top-right pill should say "SQLite connected" (green dot).
4. Add a listing via the form → record persists across page refresh and survives server restart.

If the connection pill says "localStorage (offline)" while the server is running, the frontend can't reach `/api/health` — usually a port mismatch (the server uses `process.env.PORT || 8000`).

## Backups

The SQLite file is the source of truth. For a hot backup while the server runs:
```
sqlite3 data/listings.db ".backup data/listings-backup.db"
```

JSON export from the UI still works as a portable snapshot.
