// Redfin scraper for the no-HOA tracker.
//
// Fetches listings from Redfin's internal stingray API, applies the user's
// filter criteria, and inserts/updates rows in SQLite. User-edited fields
// (status, notes, hoaConfirmed once explicitly set) are preserved on re-run.
//
// Usage: node scrape.js
// Tracker server does NOT need to be running — this writes directly to SQLite.
//
// CAVEATS:
//   - Redfin's stingray API is undocumented and can break without notice.
//   - The `hoa=0` URL filter does not actually filter; we post-filter in JS.
//   - Region IDs are NOT the same as URL slug IDs visible in Redfin.com paths.
//     Henderson NV is 8147 in the API. Tennessee state is 34. (Verified 2026-04.)

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

// User filter criteria. Edit to change scope.
const CRITERIA = {
  minBeds: 3,
  maxBeds: 5,
  minPrice: 250000,
  // No maxPrice — user wants any price as long as ROI math works.
};

// Each city query is independently capped at 350 results, so a list of cities
// pulls more candidates than a single state-wide query. State-wide TN runs
// last as a catch-all for smaller metros not explicitly listed.
const REGIONS = [
  // Nevada
  { label: 'Henderson, NV',     region_id: 8147,  region_type: 6, max_homes: 350 },

  // Tennessee — major metros
  { label: 'Nashville, TN',     region_id: 13415, region_type: 6, max_homes: 350 },
  { label: 'Knoxville, TN',     region_id: 10200, region_type: 6, max_homes: 350 },
  { label: 'Memphis, TN',       region_id: 12260, region_type: 6, max_homes: 350 },
  { label: 'Chattanooga, TN',   region_id: 3641,  region_type: 6, max_homes: 350 },
  { label: 'Murfreesboro, TN',  region_id: 13284, region_type: 6, max_homes: 350 },
  { label: 'Clarksville, TN',   region_id: 3918,  region_type: 6, max_homes: 350 },

  // Tennessee — Nashville metro suburbs
  { label: 'Franklin, TN',      region_id: 7080,  region_type: 6, max_homes: 350 },
  { label: 'Spring Hill, TN',   region_id: 18036, region_type: 6, max_homes: 350 },
  { label: 'Brentwood, TN',     region_id: 2149,  region_type: 6, max_homes: 350 },
  { label: 'Hendersonville, TN',region_id: 8509,  region_type: 6, max_homes: 350 },
  { label: 'Mount Juliet, TN',  region_id: 13070, region_type: 6, max_homes: 350 },
  { label: 'Smyrna, TN',        region_id: 17754, region_type: 6, max_homes: 350 },
  { label: 'Lebanon, TN',       region_id: 10584, region_type: 6, max_homes: 350 },
  { label: 'Gallatin, TN',      region_id: 7278,  region_type: 6, max_homes: 350 },
  { label: 'Nolensville, TN',   region_id: 13801, region_type: 6, max_homes: 350 },
  { label: 'Columbia, TN',      region_id: 4308,  region_type: 6, max_homes: 350 },

  // Tennessee — Memphis metro suburbs
  { label: 'Collierville, TN',  region_id: 4272,  region_type: 6, max_homes: 350 },
  { label: 'Germantown, TN',    region_id: 7371,  region_type: 6, max_homes: 350 },

  // Tennessee — East TN
  { label: 'Maryville, TN',     region_id: 11830, region_type: 6, max_homes: 350 },
  { label: 'Johnson City, TN',  region_id: 9725,  region_type: 6, max_homes: 350 },

  // Catch-all for any TN markets not covered above (Cookeville, Jackson,
  // Kingsport, Bristol, Cleveland, etc.) — caps at 350 statewide.
  { label: 'Tennessee (state)', region_id: 34,    region_type: 4, max_homes: 350 },
];

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15';

const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'data', 'listings.db');

async function fetchRegion({ region_id, region_type, max_homes }) {
  const url = new URL('https://www.redfin.com/stingray/api/gis');
  url.searchParams.set('al', '1');
  url.searchParams.set('num_homes', String(max_homes));
  url.searchParams.set('region_id', String(region_id));
  url.searchParams.set('region_type', String(region_type));
  url.searchParams.set('status', '9');
  url.searchParams.set('uipt', '1,2,3,4,5,6,7,8');
  url.searchParams.set('v', '8');
  // Redfin filter syntax in URL params (best-effort — server post-filters anyway):
  url.searchParams.set('min_price', String(CRITERIA.minPrice));
  url.searchParams.set('min_num_beds', String(CRITERIA.minBeds));
  url.searchParams.set('max_num_beds', String(CRITERIA.maxBeds));

  const res = await fetch(url, { headers: { 'User-Agent': UA, 'Accept': 'application/json' } });
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${url}`);
  const text = await res.text();
  const json = text.startsWith('{}&&') ? text.slice(4) : text;
  const data = JSON.parse(json);
  if (data.errorMessage !== 'Success') {
    throw new Error(`Redfin error: ${data.errorMessage} (code ${data.resultCode})`);
  }
  return data.payload.homes || [];
}

function passesCriteria(home) {
  const price = home.price && home.price.value;
  const beds = home.beds;
  if (price == null || price < CRITERIA.minPrice) return false;
  if (beds == null || beds < CRITERIA.minBeds || beds > CRITERIA.maxBeds) return false;
  // Reject listings with explicit HOA > 0. Listings without an `hoa` field stay (unverified).
  const hoaValue = home.hoa && typeof home.hoa.value === 'number' ? home.hoa.value : null;
  if (hoaValue != null && hoaValue > 0) return false;
  return true;
}

function mapHome(home, regionLabel) {
  const hoaValue = home.hoa && typeof home.hoa.value === 'number' ? home.hoa.value : null;
  const hoaConfirmed = hoaValue == null ? 'unverified' : hoaValue === 0 ? 'yes' : 'has-hoa';

  const lotSizeSqft = home.lotSize && home.lotSize.value;
  const lotSizeAcres = lotSizeSqft ? Math.round((lotSizeSqft / 43560) * 100) / 100 : null;

  const fullUrl = home.url ? `https://www.redfin.com${home.url}` : null;

  return {
    id: `redfin:${home.propertyId}`,
    mls: home.mlsId && home.mlsId.value ? home.mlsId.value : null,
    address: home.streetLine && home.streetLine.value ? home.streetLine.value : null,
    city: home.city || null,
    state: home.state || null,
    status: 'reviewed',
    price: home.price && home.price.value || null,
    beds: home.beds || null,
    baths: home.baths || null,
    sqft: home.sqFt && home.sqFt.value || null,
    lotSize: lotSizeAcres,
    yearBuilt: home.yearBuilt && home.yearBuilt.value || null,
    url: fullUrl,
    hoaConfirmed,
    notes: `Auto-imported from Redfin (${regionLabel}) on ${new Date().toISOString().slice(0, 10)}.`,
    dateAdded: Date.now(),
    lastChecked: Date.now(),
    dom: home.dom && home.dom.value || null,
  };
}

async function main() {
  if (!fs.existsSync(path.dirname(DB_PATH))) {
    fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  }
  const db = new Database(DB_PATH);
  db.exec(`
    CREATE TABLE IF NOT EXISTS listings (
      id TEXT PRIMARY KEY, mls TEXT, address TEXT, city TEXT, state TEXT, status TEXT,
      price REAL, beds REAL, baths REAL, sqft REAL, lotSize REAL, yearBuilt INTEGER,
      url TEXT, hoaConfirmed TEXT, notes TEXT, dateAdded INTEGER, lastChecked INTEGER,
      dom INTEGER
    );
  `);
  // Best-effort migration for older DBs created by an earlier scrape.
  const cols = db.prepare(`PRAGMA table_info(listings)`).all().map(c => c.name);
  if (!cols.includes('dom')) db.exec('ALTER TABLE listings ADD COLUMN dom INTEGER');

  // Clean up auto-imported listings that the user hasn't engaged with yet.
  // This drops anything previously scraped that no longer matches the new
  // criteria — but preserves anything the user has touched (status changed
  // from 'reviewed', or notes edited away from the auto-imported template).
  const purged = db.prepare(`
    DELETE FROM listings
    WHERE id LIKE 'redfin:%'
      AND status = 'reviewed'
      AND notes LIKE 'Auto-imported%'
  `).run();
  if (purged.changes) console.log(`Purged ${purged.changes} stale auto-imports before re-scrape.`);

  // Fields the scraper owns and should refresh on every run (price changes, etc.).
  const SCRAPER_FIELDS = ['price', 'beds', 'baths', 'sqft', 'lotSize', 'yearBuilt', 'url', 'lastChecked', 'dom'];
  const ALL_FIELDS = ['id', 'mls', 'address', 'city', 'state', 'status', 'hoaConfirmed', 'notes', 'dateAdded', ...SCRAPER_FIELDS];

  const insertNew = db.prepare(`
    INSERT INTO listings (${ALL_FIELDS.join(', ')})
    VALUES (${ALL_FIELDS.map(c => '@' + c).join(', ')})
    ON CONFLICT(id) DO UPDATE SET
      ${SCRAPER_FIELDS.map(f => `${f} = excluded.${f}`).join(', ')}
  `);

  const existingMlsRows = db.prepare("SELECT id, mls FROM listings WHERE mls IS NOT NULL AND mls != ''").all();
  const mlsToId = new Map(existingMlsRows.map(r => [r.mls, r.id]));

  let totalSeen = 0, totalKept = 0, totalInserted = 0, totalUpdated = 0;

  for (const region of REGIONS) {
    process.stdout.write(`Fetching ${region.label}... `);
    let homes;
    try {
      homes = await fetchRegion(region);
    } catch (err) {
      console.log(`FAILED: ${err.message}`);
      continue;
    }
    const kept = homes.filter(passesCriteria);
    const mapped = kept.map(h => mapHome(h, region.label));

    let inserted = 0, updated = 0;
    const run = db.transaction(rows => {
      for (const r of rows) {
        // Skip if an MLS-matched row exists under a different id (e.g. user added it manually).
        if (r.mls && mlsToId.has(r.mls) && mlsToId.get(r.mls) !== r.id) continue;
        const before = db.prepare('SELECT id FROM listings WHERE id = ?').get(r.id);
        insertNew.run(r);
        if (before) updated++; else inserted++;
        if (r.mls) mlsToId.set(r.mls, r.id);
      }
    });
    run(mapped);

    console.log(`${homes.length} returned, ${kept.length} match criteria, ${inserted} new, ${updated} refreshed`);
    totalSeen += homes.length;
    totalKept += kept.length;
    totalInserted += inserted;
    totalUpdated += updated;

    await new Promise(r => setTimeout(r, 1000));
  }

  console.log('---');
  console.log(`Done. ${totalSeen} listings returned across ${REGIONS.length} regions, ${totalKept} match criteria (${CRITERIA.minBeds}-${CRITERIA.maxBeds}br, $${CRITERIA.minPrice.toLocaleString()}+, no HOA), ${totalInserted} new, ${totalUpdated} refreshed.`);
  console.log(`DB: ${DB_PATH}`);
  db.close();
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
