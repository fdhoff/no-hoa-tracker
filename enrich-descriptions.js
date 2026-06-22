// Enrich listings with STR-eligibility/proven-income signals derived from
// the Redfin listing description. Reads each listing's HTML page, extracts
// the marketing remarks via JSON-LD, classifies, and writes back:
//   - strSignal: 'proven' | 'eligible' | 'advertised' | 'disqualified' | 'unknown'
//   - strSnippet: short excerpt that informed the classification (for human review)
//   - descFetched: ms-epoch of last fetch
//
// Usage:
//   node enrich-descriptions.js                  # all rows that need it
//   node enrich-descriptions.js --city Gatlinburg
//   node enrich-descriptions.js --refresh        # ignore descFetched, re-pull all
//   node enrich-descriptions.js --limit 20
//
// Notes:
//   - Redfin's per-listing API endpoints (stingray/api/home/details/*) are
//     bot-blocked. The HTML page renders fine and embeds full marketing
//     remarks in a JSON-LD <script> block — that's what we parse.
//   - Throttled at ~1.2s/listing to stay under Redfin's WAF radar.
//   - "Proven" is when the seller advertises actual rental income or calls
//     the property a "proven STR" — strongest signal. "Eligible" is when
//     they explicitly call out STR zoning/permit. "Disqualified" is when
//     they explicitly say "Permanent Residence only" or similar.

const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'data', 'listings.db');
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';
const STALE_AFTER_MS = 1000 * 60 * 60 * 24 * 14; // re-enrich after 14 days
const THROTTLE_MS = 1200;

const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(`--${name}`);
  if (i === -1) return null;
  const next = args[i + 1];
  return next && !next.startsWith('--') ? next : true;
};
const cityFilter = flag('city');
const refresh = !!flag('refresh');
const limit = flag('limit') ? parseInt(flag('limit'), 10) : null;

function classify(desc) {
  if (!desc) return { signal: 'unknown', snippet: null };
  const text = desc.replace(/\s+/g, ' ').trim();

  const tiers = [
    ['disqualified', [
      /permanent residence only/i,
      /primary residence only/i,
      /not (?:approved|zoned|eligible) for (?:short[- ]?term|str)/i,
      /no short[- ]?term rentals?/i,
      /str (?:not (?:allowed|permitted)|prohibited)/i,
      /owner[- ]occupied (?:only|required)/i,
      /residential use only/i,
    ]],
    ['proven', [
      /proven (?:str|short[- ]?term|rental|income|cabin|track record)/i,
      /actively (?:rented|operating)/i,
      /currently (?:rented|operating as|grossing)/i,
      /(?:gross(?:ing)?|annual|yearly|monthly)\s+(?:rent|income|revenue)[^.]{0,40}\$[\d,]+/i,
      /\$[\d,]+\+?\s+(?:in\s+)?(?:gross\s+)?(?:annual|yearly|monthly)?\s*(?:rent|income|revenue|bookings|gross)/i,
      /rental income(?:[^.]{0,40}\$[\d,]+|\s+(?:available|provided|history))/i,
      /booking(?:s)? (?:through|for)/i,
      /rental (?:history|records?) (?:available|provided|attached)/i,
      /turnkey (?:str|rental|short[- ]?term)/i,
    ]],
    ['eligible', [
      /str[- ]?zon(?:ed|ing)/i,
      /zoned (?:for )?(?:str|short[- ]?term rental)/i,
      /tourist residency/i,
      /\btr permit\b/i,
      /str permit/i,
      /short[- ]?term rental permit/i,
      /licensed (?:str|short[- ]?term rental|vacation rental)/i,
      /str[- ]?(?:eligible|ready|approved)/i,
      /short[- ]?term rental investment/i,
    ]],
    ['advertised', [
      /short[- ]?term rental/i,
      /vacation rental/i,
      /overnight rental/i,
      /cabin rental/i,
      /turn[- ]?key (?:rental|airbnb)/i,
      /perfect (?:airbnb|str|vrbo|vacation rental)/i,
      /investment (?:opportunity|property)/i,
    ]],
  ];

  for (const [signal, patterns] of tiers) {
    for (const p of patterns) {
      const m = text.match(p);
      if (m) {
        const idx = m.index;
        const start = Math.max(0, idx - 50);
        const end = Math.min(text.length, idx + m[0].length + 110);
        const snippet = (start > 0 ? '…' : '') + text.slice(start, end).trim() + (end < text.length ? '…' : '');
        return { signal, snippet };
      }
    }
  }
  return { signal: 'unknown', snippet: text.slice(0, 200) };
}

async function fetchDescription(url) {
  const res = await fetch(url, {
    redirect: 'follow',
    headers: {
      'User-Agent': UA,
      'Accept': 'text/html,application/xhtml+xml',
      'Accept-Language': 'en-US,en;q=0.9',
    },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const html = await res.text();
  // Find every JSON-LD block, return the description from the RealEstateListing one.
  const re = /<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g;
  let m;
  while ((m = re.exec(html)) !== null) {
    let raw = m[1].trim();
    try {
      const parsed = JSON.parse(raw);
      const candidates = Array.isArray(parsed) ? parsed : [parsed];
      for (const obj of candidates) {
        const types = Array.isArray(obj['@type']) ? obj['@type'] : [obj['@type']];
        if (types.includes('RealEstateListing') && typeof obj.description === 'string') {
          return obj.description;
        }
      }
    } catch {
      // Not valid JSON (e.g. embedded HTML entities) — skip.
    }
  }
  return null;
}

async function main() {
  const db = new Database(DB_PATH);

  // Self-migrate so this script works even if server.js hasn't been restarted.
  const cols = db.prepare(`PRAGMA table_info(listings)`).all().map(c => c.name);
  if (!cols.includes('strSignal')) db.exec('ALTER TABLE listings ADD COLUMN strSignal TEXT');
  if (!cols.includes('strSnippet')) db.exec('ALTER TABLE listings ADD COLUMN strSnippet TEXT');
  if (!cols.includes('descFetched')) db.exec('ALTER TABLE listings ADD COLUMN descFetched INTEGER');

  const now = Date.now();
  const staleBefore = now - STALE_AFTER_MS;

  const wheres = [`url IS NOT NULL`, `url != ''`, `status != 'passed'`];
  const params = {};
  if (cityFilter) {
    wheres.push(`city = @city`);
    params.city = cityFilter;
  }
  if (!refresh) {
    wheres.push(`(descFetched IS NULL OR descFetched < @staleBefore)`);
    params.staleBefore = staleBefore;
  }
  let sql = `SELECT id, address, city, url FROM listings WHERE ${wheres.join(' AND ')} ORDER BY dateAdded DESC`;
  if (limit) sql += ` LIMIT ${limit}`;

  const rows = db.prepare(sql).all(params);
  if (!rows.length) {
    console.log('No rows need enrichment.');
    db.close();
    return;
  }
  console.log(`Enriching ${rows.length} listing(s)${cityFilter ? ` in ${cityFilter}` : ''}...`);

  const update = db.prepare(`
    UPDATE listings
    SET strSignal = @signal, strSnippet = @snippet, descFetched = @ts
    WHERE id = @id
  `);

  const counts = { proven: 0, eligible: 0, advertised: 0, disqualified: 0, unknown: 0, error: 0 };

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const tag = `[${i + 1}/${rows.length}] ${row.address || row.id}`;
    try {
      const desc = await fetchDescription(row.url);
      if (!desc) {
        update.run({ id: row.id, signal: 'unknown', snippet: null, ts: Date.now() });
        counts.unknown++;
        console.log(`${tag} → unknown (no description)`);
      } else {
        const { signal, snippet } = classify(desc);
        update.run({ id: row.id, signal, snippet, ts: Date.now() });
        counts[signal]++;
        console.log(`${tag} → ${signal.toUpperCase()}${snippet ? ` :: ${snippet.slice(0, 100)}` : ''}`);
      }
    } catch (err) {
      counts.error++;
      console.log(`${tag} → ERROR ${err.message}`);
    }
    if (i < rows.length - 1) await new Promise(r => setTimeout(r, THROTTLE_MS));
  }

  console.log('---');
  console.log(`Done. proven=${counts.proven} eligible=${counts.eligible} advertised=${counts.advertised} disqualified=${counts.disqualified} unknown=${counts.unknown} errors=${counts.error}`);
  db.close();
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
