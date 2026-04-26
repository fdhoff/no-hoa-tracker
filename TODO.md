# TODO

What I'd build next, ranked by value-per-hour. Open to redirection.

---

## Investor lens (current criteria)

- **No HOA** (hard requirement)
- **3-5 bedrooms**
- **$250K minimum**, no maximum
- **Target: 10-12% ROI + appreciation potential**

Current scraped regions: Henderson NV + 8 TN cities (Nashville, Knoxville, Memphis, Chattanooga, Murfreesboro, Clarksville, Franklin, Spring Hill). 888 listings as of last scrape.

**ROI scoring is heuristic only** — Redfin doesn't return rent estimates. We surface $/sqft, $/bed, and days-on-market as proxies. Real ROI math needs a rent data source (Zillow Rent Zestimate, Rentometer, etc.) — see #1 below.

---

## Soon (high value, small)

1. **Rent estimates → real ROI numbers.** Without rent data the "10-12% ROI" criterion is unenforceable. Options: scrape Zillow's Rent Zestimate per listing (one HTTP call per address, fragile), use Rentometer's API ($30-50/mo), or roll our own with rent-comp data from Realtor.com. Once we have rent, compute cap rate and gross yield per listing, sort/filter by ROI. ~3-4 hours plus data source signup.

2. **Photos on cards.** The Redfin API returns a `photos.value` field with cryptic IDs (`"0-52:0"`) and `alternatePhotosInfo.groupCode` — but the actual CDN URL pattern isn't trivially constructable. The listing detail pages return 405 to direct curl, so we can't easily scrape `<meta property="og:image">`. Realistic path: use a headless-browser scraper (Playwright) for the photo URL on first ingest, or pay for an API that returns photos directly. ~2-3 hours with Playwright.

3. **Off-market detection.** When the scraper runs and a tracked `redfin:<id>` is no longer in the result set, mark `status='off-market'` (new status). Otherwise sold/delisted homes accumulate. ~1 hour.

4. **Appreciation signal.** Pull each region's median price trend (Redfin has a `region/snapshot` endpoint) and surface a "this neighborhood is up X% YoY" badge per listing. ~2 hours.

---

## Soon-ish (high value, medium)

5. **Map view.** `latLong.value` is already in the scraper response (we just don't store it yet — small schema add). Drop in Leaflet, plot the 888 listings, color by status. Lets the user see where listings cluster across TN. ~2-3 hours.

6. **More regions config.** Currently hardcoded in `scrape.js`. Move to a `regions.json` with friendly fields (label, type=city/state/zip, ID), and add an in-UI region picker tied to the same source. ~2 hours.

7. **Bulk-triage UI.** With 888 listings, even quick-actions per card is slow. A "swipe deck" or keyboard-driven bulk review (`j`/`k` to nav, `i`/`p` to interested/pass) would let the user blast through. ~2 hours.

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
