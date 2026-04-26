# No-HOA Home Tracker

Personal tracker for no-HOA homes. SQLite-backed, MLS-deduped, Redfin-first for browsing. Currently focused on Henderson, NV and Tennessee but works for any US state.

## Run

```
cd /Users/foster/Projects/no-hoa-tracker
npm install
npm start
```

Then open http://localhost:8000.

The pill in the top-right shows **SQLite connected** (writing to `data/listings.db`) or **localStorage (offline)** (backend not reachable, fallback mode).

If you're upgrading from a prior localStorage-only version, the **Sync localStorage →** button appears in the toolbar when there are listings in your browser that aren't in SQLite yet. One click migrates them.

## Workflow

### Capturing a listing (fast path)

1. Open `http://localhost:8000/bookmarklet.html`, drag **+ to No-HOA Tracker** to your bookmarks bar.
2. On any Redfin listing detail page, click the bookmarklet.
3. The tracker opens in a new tab with the form pre-filled (address, price, beds/baths, sqft, lot size, year built, MLS#, HOA status, URL). Review, adjust, save.
4. If the MLS# / URL is already tracked, you get the existing record instead of a duplicate.

### Capturing a listing (manual)

1. Browse on Redfin via the pinned region links (Henderson, TN) or the "Jump to state" picker. Apply HOA Fee max = $0 in Redfin's filter panel.
2. Paste the MLS# (or Redfin URL) into the **"Already checked?"** lookup at the top:
   - **Hit:** instantly shows status, last check date, and an open link.
   - **Miss:** click "+ Add it" to record it (the field is pre-filled).

### Status pipeline

Reviewed → Interested → Contacted → Viewed in Person → Offer → Under Contract / Passed.

Default for a new entry is *Reviewed* — meaning "looked at it, no action yet." HOA flag is separate from status (`confirmed no-HOA` / `unverified` / `has-HOA`) so you record what you've actually verified vs. what the listing claims.

## Architecture

- **`server.js`** — Node/Express + better-sqlite3. Serves the static frontend on port 8000 and exposes a tiny REST API:
  - `GET /api/health` — liveness + listing count
  - `GET /api/listings` — list all
  - `PUT /api/listings/:id` — upsert one
  - `POST /api/listings/bulk` — upsert many (transactional)
  - `DELETE /api/listings/:id`
- **`data/listings.db`** — SQLite file, WAL mode. Schema lives at the top of `server.js`. Back this up with a simple file copy.
- **Frontend (`app.js`)** — talks to the API when reachable, falls back to localStorage otherwise. Same code path renders either way.

## Pinned regions

Edit the `PINNED_REGIONS` array near the top of `app.js` to change the one-click Redfin browse links. All 50 states are also reachable through the "Jump to state" dropdown.

## Files

- `index.html` / `app.js` / `styles.css` — frontend
- `server.js` — Node/Express + SQLite backend
- `package.json` — dependencies
- `data/listings.db` — SQLite database (gitignored, created on first run)
- `bookmarklet.html` — install page for the Redfin scraping bookmarklet
- `bookmarklet-src.js` — readable source of what the bookmarklet does

## Backups

- **JSON export** writes a snapshot of all listings — keep one periodically.
- **SQLite file copy** — `cp data/listings.db data/listings-backup.db` when the server is stopped (or `sqlite3 data/listings.db ".backup data/listings-backup.db"` while running).

## Bookmarklet notes

The scraper uses Redfin DOM selectors and page-text regex matching. Selectors break occasionally when Redfin reships their UI — if a field stops getting captured, edit the selector list in `bookmarklet-src.js` and copy the change into `bookmarklet.html`'s minified source string.

Bookmarklets can't open `file://` URLs — that's why the tracker has to be served on `http://localhost`.
