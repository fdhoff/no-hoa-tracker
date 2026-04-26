// Redfin scraper for the no-HOA tracker.
//
// Fetches listings from Redfin's internal stingray API, filters out anything
// with an HOA, and inserts new ones into the SQLite DB. Existing listings
// (matched by MLS#) are skipped so user-edited fields like status/notes are
// never clobbered.
//
// Usage: node scrape.js
// Tracker server does NOT need to be running — this writes directly to SQLite.
//
// CAVEATS:
//   - Redfin's stingray API is undocumented and can break without notice.
//   - The `hoa=0` URL filter does not actually filter; we post-filter in JS.
//   - Region IDs are NOT the same as the URL slug IDs visible in Redfin.com paths.
//     Henderson NV is 8147 in the API. Tennessee state is 34. (Verified 2026-04.)

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const REGIONS = [
  { label: 'Henderson, NV', region_id: 8147, region_type: 6, max_homes: 200 },
  { label: 'Tennessee',     region_id: 34,   region_type: 4, max_homes: 350 },
];

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15';

const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'data', 'listings.db');

async function fetchRegion({ region_id, region_type, max_homes }) {
  const url = new URL('https://www.redfin.com/stingray/api/gis');
  url.searchParams.set('al', '1');
  url.searchParams.set('num_homes', String(max_homes));
  url.searchParams.set('region_id', String(region_id));
  url.searchParams.set('region_type', String(region_type));
  url.searchParams.set('status', '9'); // active for sale
  url.searchParams.set('uipt', '1,2,3,4,5,6,7,8'); // all property types
  url.searchParams.set('v', '8');

  const res = await fetch(url, { headers: { 'User-Agent': UA, 'Accept': 'application/json' } });
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${url}`);
  const text = await res.text();
  // Strip the {}&& prefix Redfin uses to break naive JSON eval.
  const json = text.startsWith('{}&&') ? text.slice(4) : text;
  const data = JSON.parse(json);
  if (data.errorMessage !== 'Success') {
    throw new Error(`Redfin error: ${data.errorMessage} (code ${data.resultCode})`);
  }
  return data.payload.homes || [];
}

function mapHome(home, regionLabel) {
  // hoa.value > 0 means there IS an HOA. We want listings without one.
  const hoaValue = home.hoa && typeof home.hoa.value === 'number' ? home.hoa.value : null;
  const hoaConfirmed = hoaValue == null ? 'unverified' : hoaValue === 0 ? 'yes' : 'has-hoa';

  const lotSizeSqft = home.lotSize && home.lotSize.value;
  const lotSizeAcres = lotSizeSqft ? Math.round((lotSizeSqft / 43560) * 100) / 100 : null;

  const fullUrl = home.url ? `https://www.redfin.com${home.url}` : null;

  return {
    // Deterministic ID — running the scraper twice for the same propertyId
    // produces the same id, so INSERT OR REPLACE skips duplicates.
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
    _hoaValue: hoaValue, // not persisted, used for filtering
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
      url TEXT, hoaConfirmed TEXT, notes TEXT, dateAdded INTEGER, lastChecked INTEGER
    );
  `);

  const COLS = ['id','mls','address','city','state','status','price','beds','baths','sqft','lotSize','yearBuilt','url','hoaConfirmed','notes','dateAdded','lastChecked'];
  const insert = db.prepare(`INSERT OR IGNORE INTO listings (${COLS.join(', ')}) VALUES (${COLS.map(c=>'@'+c).join(', ')})`);
  const existingMls = new Set(db.prepare("SELECT mls FROM listings WHERE mls IS NOT NULL AND mls != ''").all().map(r => r.mls));

  let totalSeen = 0, totalNoHoa = 0, totalInserted = 0, totalSkippedDup = 0;

  for (const region of REGIONS) {
    process.stdout.write(`Fetching ${region.label}... `);
    let homes;
    try {
      homes = await fetchRegion(region);
    } catch (err) {
      console.log(`FAILED: ${err.message}`);
      continue;
    }
    const mapped = homes.map(h => mapHome(h, region.label));
    const noHoa = mapped.filter(m => m.hoaConfirmed !== 'has-hoa');
    const newOnes = noHoa.filter(m => !m.mls || !existingMls.has(m.mls));
    const dupCount = noHoa.length - newOnes.length;

    const insertMany = db.transaction(rows => {
      let inserted = 0;
      for (const r of rows) {
        const { _hoaValue, ...row } = r;
        const result = insert.run(row);
        if (result.changes > 0) {
          inserted++;
          if (r.mls) existingMls.add(r.mls);
        }
      }
      return inserted;
    });
    const inserted = insertMany(newOnes);

    console.log(`${homes.length} total, ${noHoa.length} no-HOA, ${dupCount} already tracked, ${inserted} inserted`);
    totalSeen += homes.length;
    totalNoHoa += noHoa.length;
    totalInserted += inserted;
    totalSkippedDup += dupCount;

    // Be polite — pause between regions so we don't hammer Redfin.
    await new Promise(r => setTimeout(r, 1000));
  }

  console.log('---');
  console.log(`Done. Saw ${totalSeen} listings across ${REGIONS.length} regions, ${totalNoHoa} with no HOA, ${totalSkippedDup} already tracked, ${totalInserted} new inserted into ${DB_PATH}.`);
  db.close();
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
