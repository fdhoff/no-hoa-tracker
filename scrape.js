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
  minPrice: 100000,
  // No maxPrice — user wants any price as long as ROI math works.
};

// Each city query is independently capped at 350 results, so a list of cities
// pulls more candidates than a single state-wide query. State-wide TN runs
// last as a catch-all for smaller metros not explicitly listed.
const REGIONS = [
  // Nevada
  { label: 'Henderson, NV', region_id: 8147, region_type: 6, max_homes: 350 },
  // Pahrump (Nye Co., unincorporated, ~1hr from Henderson — STR-permissive alt to Clark Co.). Zip IDs resolved 2026-06-22.
  { label: 'Pahrump, NV (89048)', region_id: 37244, region_type: 2, max_homes: 350 },
  { label: 'Pahrump N, NV (89060)', region_id: 37248, region_type: 2, max_homes: 350 },

  // Texas
  { label: 'Abilene, TX (79605)', region_id: 34847, region_type: 1, max_homes: 350, market: 'texas' },

  // Tennessee — East TN
  { label: 'Maryville, TN',  region_id: 11830, region_type: 6, max_homes: 350 },
  // Gatlinburg city ID 7311 was recycled to Garland, TN; use zipcode 37738 instead.
  { label: 'Gatlinburg, TN (37738)',  region_id: 15973, region_type: 2, max_homes: 350 },
  { label: 'Pigeon Forge, TN (37863)', region_id: 16041, region_type: 2, max_homes: 350 },
  // Tier A Smokies deepening (unincorporated Sevier/Cocke Co. — STR by-right w/ permit). Zip region IDs resolved 2026-06-21.
  { label: 'Sevierville/Wears Valley, TN (37862)', region_id: 16040, region_type: 2, max_homes: 350 },
  { label: 'Townsend, TN (37882)', region_id: 16059, region_type: 2, max_homes: 350 },
  { label: 'Cosby, TN (37722)', region_id: 15961, region_type: 2, max_homes: 350 },
  { label: 'Newport, TN (37821)', region_id: 16016, region_type: 2, max_homes: 350 },
  { label: 'Kodak, TN (37764)', region_id: 15988, region_type: 2, max_homes: 350 },
  { label: 'Tennessee (state)', region_id: 34, region_type: 4, max_homes: 350 },

  // North Carolina — Smokies/GSMNP NC gateway (same park demand & drive radius as the TN side). Zip IDs resolved 2026-06-22.
  { label: 'Bryson City, NC (28713)', region_id: 11738, region_type: 2, max_homes: 350 },
  { label: 'Maggie Valley, NC (28751)', region_id: 11776, region_type: 2, max_homes: 350 },
  { label: 'Waynesville, NC (28786)', region_id: 11807, region_type: 2, max_homes: 350 },
];


const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15';

const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'data', 'listings.db');

async function fetchRegion({ region_id, region_type, max_homes, market }) {
  const url = new URL('https://www.redfin.com/stingray/api/gis');
  url.searchParams.set('al', '1');
  url.searchParams.set('num_homes', String(max_homes));
  url.searchParams.set('region_id', String(region_id));
  url.searchParams.set('region_type', String(region_type));
  if (market) url.searchParams.set('market', market);
  url.searchParams.set('status', '9');
  // uipt 7 = mobile/manufactured. Excluded — see passesCriteria for the post-filter.
  url.searchParams.set('uipt', '1,2,3,4,5,6,8');
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
  // Reject mobile/manufactured homes — not viable as STVR (permitting, financing, insurance).
  if (home.uiPropertyType === 7) return false;
  return true;
}

function mapHome(home, regionLabel) {
  const hoaValue = home.hoa && typeof home.hoa.value === 'number' ? home.hoa.value : null;
  const hoaConfirmed = hoaValue == null ? 'unverified' : hoaValue === 0 ? 'yes' : 'has-hoa';

  const lotSizeSqft = home.lotSize && home.lotSize.value;
  const lotSizeAcres = lotSizeSqft ? Math.round((lotSizeSqft / 43560) * 100) / 100 : null;

  const fullUrl = home.url ? `https://www.redfin.com${home.url}` : null;

  const price = home.price && home.price.value || null;
  const beds = home.beds || null;
  const state = home.state || null;

  // ROI Heuristic
  let estRent = null;
  let roi = null;
  if (state === 'TN' && beds && price) {
    estRent = beds * 25000;
    const netIncome = estRent * 0.55; // 45% OpEx
    roi = Math.round((netIncome / price) * 1000) / 10;
  } else if (state === 'TX' && beds && price) {
    // Abilene heuristic: slightly lower gross but much lower entry price
    estRent = beds * 15000; 
    const netIncome = estRent * 0.60; // 40% OpEx (lower than mountain cabins)
    roi = Math.round((netIncome / price) * 1000) / 10;
  }

  return {
    id: `redfin:${home.propertyId}`,
    mls: home.mlsId && home.mlsId.value ? home.mlsId.value : null,
    address: home.streetLine && home.streetLine.value ? home.streetLine.value : null,
    city: home.city || null,
    state,
    status: 'reviewed',
    price,
    beds,
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
    estRent,
    roi,
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
      dom INTEGER, estRent REAL, roi REAL, strSignal TEXT, strSnippet TEXT, descFetched INTEGER
    );
  `);
  // Best-effort migration for older DBs created by an earlier scrape.
  const cols = db.prepare(`PRAGMA table_info(listings)`).all().map(c => c.name);
  if (!cols.includes('dom')) db.exec('ALTER TABLE listings ADD COLUMN dom INTEGER');
  if (!cols.includes('estRent')) db.exec('ALTER TABLE listings ADD COLUMN estRent REAL');
  if (!cols.includes('roi')) db.exec('ALTER TABLE listings ADD COLUMN roi REAL');
  if (!cols.includes('strSignal')) db.exec('ALTER TABLE listings ADD COLUMN strSignal TEXT');
  if (!cols.includes('strSnippet')) db.exec('ALTER TABLE listings ADD COLUMN strSnippet TEXT');
  if (!cols.includes('descFetched')) db.exec('ALTER TABLE listings ADD COLUMN descFetched INTEGER');

  // Clean up auto-imported listings that the user hasn't engaged with yet.
  // This drops anything previously scraped that no longer matches the new
  // criteria — but preserves anything the user has touched (status changed
  // from 'reviewed', notes edited away from the auto-imported template, or
  // we've already invested an enrichment fetch in classifying it).
  const purged = db.prepare(`
    DELETE FROM listings
    WHERE id LIKE 'redfin:%'
      AND status = 'reviewed'
      AND notes LIKE 'Auto-imported%'
      AND strSignal IS NULL
  `).run();
  if (purged.changes) console.log(`Purged ${purged.changes} stale auto-imports before re-scrape.`);

  // Fields the scraper owns and should refresh on every run (price changes, etc.).
  const SCRAPER_FIELDS = ['price', 'beds', 'baths', 'sqft', 'lotSize', 'yearBuilt', 'url', 'lastChecked', 'dom', 'estRent', 'roi'];
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
        console.log(`Inserting: ${r.id} | ${r.city} | ${r.state} | ${r.price}`);
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
