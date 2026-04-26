# TODO

What I'd build next, ranked by value-per-hour. Open to redirection.

---

## Open questions for the user

A few inputs would let me tighten the scraper and the UI without guessing:

- **Max price?** Right now we pull $2M+ luxury homes that probably aren't relevant. Add a max to `REGIONS` config in `scrape.js`.
- **TN cities?** State-wide TN is 200+ listings, too broad. If you have specific targets (Nashville, Knoxville, Chattanooga, Murfreesboro, etc.), I'd swap the state-level pull for city-level pulls — fewer listings, all relevant.
- **Bedroom / sqft minimums?** Same idea — pre-filter at scrape time so the tracker isn't full of studios or 700sqft cottages.

Drop a comment in this file or just answer in chat and I'll wire it up.

---

## Soon (high value, small)

1. **Photos on cards.** The Redfin API already returns a `photos` array; we discard it. Storing the primary photo URL and rendering it as the card's background or a thumbnail strip makes the tracker stop looking like a database dump. ~1 hour.

2. **Quick-action buttons on cards.** With 227 listings to triage, opening the modal for every status change is tedious. Add inline buttons on each card: `✓ Confirmed no-HOA`, `✗ Has HOA`, `Pass`, `Interested`. ~1 hour.

3. **Scraper price/beds/sqft filters.** Add `max_price`, `min_beds`, `min_sqft` to `REGIONS` config. Right now the scraper pulls everything and we filter visually. ~30 min once the user provides the numbers.

4. **Listing freshness.** Show "listed 3 days ago" / "price dropped" badges. Redfin returns `dom` (days on market) and `originalListPrice` — we just need to store and display them. ~1 hour.

---

## Soon-ish (high value, medium)

5. **Map view.** `latLong.value` is already in the scraper response — drop in Leaflet, plot the listings, color by status. Especially useful for Tennessee where the user hasn't picked a city yet — the map shows where homes cluster. ~2-3 hours.

6. **Off-market detection.** When the scraper runs and a previously-tracked MLS# is no longer in the result, mark it `status: 'off-market'` (new status to add) so it stops appearing in active filters. Otherwise stale listings accumulate forever. ~1 hour.

7. **More regions.** Currently hardcoded in `scrape.js`. Move to a `regions.json` config file with friendly fields (label, type=city/state/zip, search params), and add an in-UI region picker tied to the same source. ~2 hours.

---

## Eventually

8. **Scheduled scraping.** Once the scraper proves stable, run via launchd daily at 6am. Plus a "last scrape: 2h ago" indicator in the UI. *User explicitly said keep manual for now — bring back when they're ready.*

9. **PWA / mobile.** Make the tracker installable on iOS/Android home screen, fix any layout issues at narrow widths. The whole "look at this listing in the car" use case lives here.

10. **Bookmarklet → extension.** The bookmarklet is fragile (Redfin DOM changes break it). A small browser extension scoped to redfin.com domains would be more reliable and could add a "✓ in tracker" overlay on every listing in their search results.

11. **Saved searches with email digest.** Define a search (state, city, max price, etc.), get a daily email with new matches. Probably overkill for one user but worth considering once the basic tooling is solid.

---

## Tech debt to address before adding more features

- **Tests.** Zero coverage right now. At minimum: a smoke test that hits each `/api/*` endpoint and a unit test on the scraper's `mapHome()` field-mapping logic.
- **Bookmarklet duplication.** `bookmarklet-src.js` and the inline minified version in `bookmarklet.html` drift easily. Build step (esbuild --minify) → write to both during build.
- **Error visibility.** Scraper failures are console-only. If we schedule it, need a way to know it broke — at minimum a `data/scrape-log.txt` with last run status.
- **Backup automation.** Currently zero. A simple cron that runs `sqlite3 .backup` weekly to a Time Machine-tracked folder is enough for personal use.

---

## Probably *don't* do

- **Auth / multi-user.** This is a single-user tool. Skip until there's a real reason.
- **Cloud sync.** User chose SQLite over Supabase deliberately. Don't reintroduce.
- **Comps / valuation analysis.** Tempting but Redfin already shows you comps on each listing detail page. Don't rebuild what's a click away.
- **Zillow / Realtor.com integration.** Doubles the scraper surface area. Single source of truth (Redfin) is fine.
