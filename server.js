const express = require('express');
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const PORT = process.env.PORT || 8000;
const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'data', 'listings.db');

fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.exec(`
  CREATE TABLE IF NOT EXISTS listings (
    id TEXT PRIMARY KEY,
    mls TEXT,
    address TEXT,
    city TEXT,
    state TEXT,
    status TEXT,
    price REAL,
    beds REAL,
    baths REAL,
    sqft REAL,
    lotSize REAL,
    yearBuilt INTEGER,
    url TEXT,
    hoaConfirmed TEXT,
    notes TEXT,
    dateAdded INTEGER,
    lastChecked INTEGER,
    dom INTEGER
  );
  CREATE INDEX IF NOT EXISTS idx_listings_mls ON listings(mls);
  CREATE INDEX IF NOT EXISTS idx_listings_state ON listings(state);
  CREATE INDEX IF NOT EXISTS idx_listings_status ON listings(status);
`);

// Schema migrations — additive only. New columns get added if missing.
function ensureColumn(name, type) {
  const cols = db.prepare(`PRAGMA table_info(listings)`).all().map(c => c.name);
  if (!cols.includes(name)) db.exec(`ALTER TABLE listings ADD COLUMN ${name} ${type}`);
}
ensureColumn('dom', 'INTEGER');

const COLS = ['id', 'mls', 'address', 'city', 'state', 'status', 'price', 'beds', 'baths', 'sqft', 'lotSize', 'yearBuilt', 'url', 'hoaConfirmed', 'notes', 'dateAdded', 'lastChecked', 'dom'];

const stmts = {
  list: db.prepare('SELECT * FROM listings ORDER BY dateAdded DESC'),
  get: db.prepare('SELECT * FROM listings WHERE id = ?'),
  upsert: db.prepare(`INSERT OR REPLACE INTO listings (${COLS.join(', ')}) VALUES (${COLS.map(c => '@' + c).join(', ')})`),
  del: db.prepare('DELETE FROM listings WHERE id = ?'),
  count: db.prepare('SELECT COUNT(*) AS n FROM listings'),
};

function normalize(l) {
  const out = {};
  for (const c of COLS) out[c] = l[c] === undefined ? null : l[c];
  return out;
}

const app = express();
app.use(express.json({ limit: '10mb' }));
app.use(express.static(__dirname));

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, count: stmts.count.get().n });
});

app.get('/api/listings', (_req, res) => {
  res.json(stmts.list.all());
});

app.put('/api/listings/:id', (req, res) => {
  const data = normalize({ ...req.body, id: req.params.id });
  stmts.upsert.run(data);
  res.json(data);
});

app.post('/api/listings', (req, res) => {
  const data = normalize(req.body);
  if (!data.id) return res.status(400).json({ error: 'id required' });
  stmts.upsert.run(data);
  res.json(data);
});

app.delete('/api/listings/:id', (req, res) => {
  const result = stmts.del.run(req.params.id);
  res.json({ deleted: result.changes });
});

app.post('/api/listings/bulk', (req, res) => {
  const items = Array.isArray(req.body) ? req.body : [];
  const insertMany = db.transaction(rows => {
    for (const r of rows) stmts.upsert.run(normalize(r));
  });
  insertMany(items);
  res.json({ inserted: items.length });
});

app.listen(PORT, () => {
  console.log(`No-HOA Tracker → http://localhost:${PORT}`);
  console.log(`SQLite DB → ${DB_PATH}`);
  console.log(`Listings in DB: ${stmts.count.get().n}`);
});
