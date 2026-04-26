const STORAGE_KEY = 'no-hoa-tracker:listings';
const SCHEMA_VERSION = 2;

// Pinned regions get one-click Redfin browse links. Edit to taste.
const PINNED_REGIONS = [
  { label: 'Henderson, NV', url: 'https://www.redfin.com/city/8147/NV/Henderson' },
  { label: 'Tennessee', url: 'https://www.redfin.com/state/Tennessee' },
];

const US_STATES = [
  ['AL', 'Alabama'], ['AK', 'Alaska'], ['AZ', 'Arizona'], ['AR', 'Arkansas'],
  ['CA', 'California'], ['CO', 'Colorado'], ['CT', 'Connecticut'], ['DE', 'Delaware'],
  ['FL', 'Florida'], ['GA', 'Georgia'], ['HI', 'Hawaii'], ['ID', 'Idaho'],
  ['IL', 'Illinois'], ['IN', 'Indiana'], ['IA', 'Iowa'], ['KS', 'Kansas'],
  ['KY', 'Kentucky'], ['LA', 'Louisiana'], ['ME', 'Maine'], ['MD', 'Maryland'],
  ['MA', 'Massachusetts'], ['MI', 'Michigan'], ['MN', 'Minnesota'], ['MS', 'Mississippi'],
  ['MO', 'Missouri'], ['MT', 'Montana'], ['NE', 'Nebraska'], ['NV', 'Nevada'],
  ['NH', 'New Hampshire'], ['NJ', 'New Jersey'], ['NM', 'New Mexico'], ['NY', 'New York'],
  ['NC', 'North Carolina'], ['ND', 'North Dakota'], ['OH', 'Ohio'], ['OK', 'Oklahoma'],
  ['OR', 'Oregon'], ['PA', 'Pennsylvania'], ['RI', 'Rhode Island'], ['SC', 'South Carolina'],
  ['SD', 'South Dakota'], ['TN', 'Tennessee'], ['TX', 'Texas'], ['UT', 'Utah'],
  ['VT', 'Vermont'], ['VA', 'Virginia'], ['WA', 'Washington'], ['WV', 'West Virginia'],
  ['WI', 'Wisconsin'], ['WY', 'Wyoming'], ['DC', 'District of Columbia'],
];
const STATE_NAME = Object.fromEntries(US_STATES);

const STATUS_LABELS = {
  reviewed: 'Reviewed',
  interested: 'Interested',
  contacted: 'Contacted',
  viewed: 'Viewed in Person',
  offer: 'Offer Made',
  'under-contract': 'Under Contract',
  passed: 'Passed',
};

let listings = [];

const els = {
  listings: document.getElementById('listings'),
  stats: document.getElementById('stats'),
  filterState: document.getElementById('filter-state'),
  filterStatus: document.getElementById('filter-status'),
  sortBy: document.getElementById('sort-by'),
  search: document.getElementById('search'),
  addBtn: document.getElementById('add-btn'),
  modal: document.getElementById('modal'),
  modalTitle: document.getElementById('modal-title'),
  modalClose: document.getElementById('modal-close'),
  cancelBtn: document.getElementById('cancel-btn'),
  deleteBtn: document.getElementById('delete-btn'),
  form: document.getElementById('listing-form'),
  exportJson: document.getElementById('export-json'),
  exportCsv: document.getElementById('export-csv'),
  importBtn: document.getElementById('import-btn'),
  importFile: document.getElementById('import-file'),
  pinnedRegions: document.getElementById('pinned-regions'),
  stateJump: document.getElementById('state-jump'),
  mlsLookup: document.getElementById('mls-lookup'),
  mlsLookupResult: document.getElementById('mls-lookup-result'),
  stateSelect: document.getElementById('state'),
};

function migrate(l) {
  // v1 used `region: 'henderson-nv' | 'tennessee'`; v2 uses state + city.
  if (l.region && !l.state) {
    if (l.region === 'henderson-nv') {
      l.state = 'NV';
      l.city = l.city || 'Henderson';
    } else if (l.region === 'tennessee') {
      l.state = 'TN';
    }
    delete l.region;
  }
  return l;
}

function readLocalStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw).map(migrate);
  } catch {
    return [];
  }
}

function writeLocalStorage() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(listings));
}

const Storage = {
  mode: 'localStorage', // 'api' when backend is reachable

  async init() {
    try {
      const r = await fetch('api/health', { cache: 'no-store' });
      if (r.ok) {
        this.mode = 'api';
        return await r.json();
      }
    } catch {
      // backend not reachable — stay on localStorage
    }
    return { ok: false };
  },

  async load() {
    if (this.mode === 'api') {
      const r = await fetch('api/listings', { cache: 'no-store' });
      if (!r.ok) throw new Error('load failed: ' + r.status);
      const data = await r.json();
      return data.map(migrate);
    }
    return readLocalStorage();
  },

  async upsert(listing) {
    if (this.mode === 'api') {
      const r = await fetch('api/listings/' + encodeURIComponent(listing.id), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(listing),
      });
      if (!r.ok) throw new Error('save failed: ' + r.status);
    } else {
      writeLocalStorage();
    }
  },

  async remove(id) {
    if (this.mode === 'api') {
      const r = await fetch('api/listings/' + encodeURIComponent(id), { method: 'DELETE' });
      if (!r.ok) throw new Error('delete failed: ' + r.status);
    } else {
      writeLocalStorage();
    }
  },

  async bulkUpsert(items) {
    if (this.mode === 'api') {
      const r = await fetch('api/listings/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(items),
      });
      if (!r.ok) throw new Error('bulk import failed: ' + r.status);
      return r.json();
    }
    writeLocalStorage();
    return { inserted: items.length };
  },
};

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function fmtMoney(n) {
  if (n == null || n === '') return '—';
  return '$' + Number(n).toLocaleString();
}

function pricePerSqft(l) {
  if (!l.price || !l.sqft) return null;
  return l.price / l.sqft;
}

function locationLabel(l) {
  const parts = [];
  if (l.city) parts.push(l.city);
  if (l.state) parts.push(l.state);
  return parts.join(', ');
}

function getFiltered() {
  const state = els.filterState.value;
  const status = els.filterStatus.value;
  const q = els.search.value.trim().toLowerCase();
  const sort = els.sortBy.value;

  let result = listings.filter(l => {
    if (state !== 'all' && l.state !== state) return false;
    if (status !== 'all' && l.status !== status) return false;
    if (q) {
      const hay = [l.address, l.city, l.state, l.notes, l.mls, l.url].filter(Boolean).join(' ').toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  const [field, dir] = sort.split('-');
  result.sort((a, b) => {
    let av, bv;
    if (field === 'pricePerSqft') {
      av = pricePerSqft(a) ?? Infinity;
      bv = pricePerSqft(b) ?? Infinity;
    } else {
      av = a[field] ?? (dir === 'asc' ? Infinity : -Infinity);
      bv = b[field] ?? (dir === 'asc' ? Infinity : -Infinity);
    }
    if (typeof av === 'string') return dir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
    return dir === 'asc' ? av - bv : bv - av;
  });

  return result;
}

function renderPinned() {
  els.pinnedRegions.innerHTML = PINNED_REGIONS.map(r =>
    `<a class="quick-link" href="${r.url}" target="_blank" rel="noopener">${escapeHtml(r.label)}</a>`
  ).join('');
}

function renderStateOptions() {
  // Form state dropdown — full US list
  els.stateSelect.innerHTML = US_STATES.map(([code, name]) =>
    `<option value="${code}">${name} (${code})</option>`
  ).join('');

  // Filter state dropdown — only states the user has data for, plus All
  const used = [...new Set(listings.map(l => l.state).filter(Boolean))].sort();
  const current = els.filterState.value || 'all';
  els.filterState.innerHTML = `<option value="all">All</option>` + used.map(code =>
    `<option value="${code}">${STATE_NAME[code] || code}</option>`
  ).join('');
  els.filterState.value = used.includes(current) || current === 'all' ? current : 'all';

  // State-jump dropdown for browsing Redfin
  els.stateJump.innerHTML = `<option value="">Jump to state…</option>` + US_STATES.map(([code, name]) =>
    `<option value="${name}">${name}</option>`
  ).join('');
}

function renderStats() {
  const filtered = getFiltered();
  const active = filtered.filter(l => l.status !== 'passed' && l.status !== 'reviewed');
  const prices = active.map(l => l.price).filter(Boolean);
  const avg = prices.length ? prices.reduce((a, b) => a + b, 0) / prices.length : 0;
  const ppsfArr = active.map(pricePerSqft).filter(v => v != null);
  const avgPpsf = ppsfArr.length ? ppsfArr.reduce((a, b) => a + b, 0) / ppsfArr.length : 0;

  els.stats.innerHTML = `
    <div class="stat"><span class="label">Showing</span><span class="value">${filtered.length}</span></div>
    <div class="stat"><span class="label">In Pipeline</span><span class="value">${active.length}</span></div>
    <div class="stat"><span class="label">Avg Price</span><span class="value">${fmtMoney(Math.round(avg))}</span></div>
    <div class="stat"><span class="label">Avg $/Sqft</span><span class="value">${avgPpsf ? '$' + avgPpsf.toFixed(0) : '—'}</span></div>
  `;
}

function renderListings() {
  const filtered = getFiltered();
  if (!filtered.length) {
    els.listings.innerHTML = `<div class="empty">No listings yet. Click <strong>+ Add Listing</strong> to get started.</div>`;
    return;
  }

  els.listings.innerHTML = filtered.map(l => {
    const ppsf = pricePerSqft(l);
    const specs = [
      l.beds != null && l.beds !== '' ? `${l.beds} bd` : null,
      l.baths != null && l.baths !== '' ? `${l.baths} ba` : null,
      l.sqft ? `${Number(l.sqft).toLocaleString()} sqft` : null,
      l.lotSize ? `${l.lotSize} ac` : null,
      l.yearBuilt ? `Built ${l.yearBuilt}` : null,
      ppsf ? `$${ppsf.toFixed(0)}/sqft` : null,
    ].filter(Boolean);

    return `
      <div class="card" data-id="${l.id}">
        <div class="card-header">
          <div class="card-head-info">
            <div class="card-address">${escapeHtml(l.address || 'Untitled')}</div>
            <div class="card-region">${escapeHtml(locationLabel(l))}${l.mls ? ` &middot; MLS ${escapeHtml(l.mls)}` : ''}</div>
          </div>
          <div class="card-price-block">
            <div class="card-price">${fmtMoney(l.price)}</div>
            ${l.url ? `<a class="card-link" href="${escapeHtml(l.url)}" target="_blank" rel="noopener" data-noedit>${redfinLabel(l.url)} ↗</a>` : ''}
          </div>
        </div>
        <div class="card-specs">${specs.map(s => `<span>${s}</span>`).join('')}</div>
        ${l.notes ? `<div class="card-notes">${escapeHtml(l.notes)}</div>` : ''}
        <div class="card-footer">
          <span class="badge badge-${l.status}">${STATUS_LABELS[l.status] || l.status}</span>
          <span class="hoa-flag hoa-${l.hoaConfirmed || 'unverified'}">${hoaLabel(l.hoaConfirmed)}</span>
          ${l.lastChecked ? `<span class="checked-date">checked ${fmtDate(l.lastChecked)}</span>` : ''}
        </div>
      </div>
    `;
  }).join('');

  els.listings.querySelectorAll('.card').forEach(card => {
    card.addEventListener('click', e => {
      if (e.target.closest('[data-noedit]')) return;
      openModal(card.dataset.id);
    });
  });
}

function redfinLabel(url) {
  try {
    return new URL(url).hostname.includes('redfin') ? 'Redfin' : 'View';
  } catch {
    return 'View';
  }
}

function fmtDate(ts) {
  const d = new Date(ts);
  const today = new Date();
  const diff = Math.floor((today - d) / 86400000);
  if (diff === 0) return 'today';
  if (diff === 1) return 'yesterday';
  if (diff < 7) return `${diff}d ago`;
  return d.toISOString().slice(0, 10);
}

function hoaLabel(v) {
  return v === 'yes' ? 'No HOA ✓' : v === 'has-hoa' ? 'Has HOA' : 'HOA unverified';
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function render() {
  renderStateOptions();
  renderStats();
  renderListings();
}

function openModal(id = null) {
  els.form.reset();
  if (id) {
    const l = listings.find(x => x.id === id);
    if (!l) return;
    els.modalTitle.textContent = 'Edit Listing';
    els.deleteBtn.hidden = false;
    document.getElementById('listing-id').value = l.id;
    document.getElementById('mls').value = l.mls || '';
    document.getElementById('address').value = l.address || '';
    document.getElementById('city').value = l.city || '';
    document.getElementById('state').value = l.state || 'NV';
    document.getElementById('status').value = l.status || 'reviewed';
    document.getElementById('price').value = l.price || '';
    document.getElementById('beds').value = l.beds ?? '';
    document.getElementById('baths').value = l.baths ?? '';
    document.getElementById('sqft').value = l.sqft || '';
    document.getElementById('lotSize').value = l.lotSize || '';
    document.getElementById('yearBuilt').value = l.yearBuilt || '';
    document.getElementById('url').value = l.url || '';
    document.getElementById('hoaConfirmed').value = l.hoaConfirmed || 'unverified';
    document.getElementById('notes').value = l.notes || '';
  } else {
    els.modalTitle.textContent = 'Add Listing';
    els.deleteBtn.hidden = true;
    document.getElementById('listing-id').value = '';
    const filterState = els.filterState.value;
    document.getElementById('state').value = filterState !== 'all' ? filterState : 'NV';
    document.getElementById('hoaConfirmed').value = 'unverified';
    document.getElementById('status').value = 'reviewed';
  }
  els.modal.hidden = false;
}

function closeModal() {
  els.modal.hidden = true;
}

async function handleSubmit(e) {
  e.preventDefault();
  const id = document.getElementById('listing-id').value;
  const mls = document.getElementById('mls').value.trim();

  // Dedup warning on MLS#
  if (mls) {
    const existing = listings.find(l => l.mls && l.mls === mls && l.id !== id);
    if (existing) {
      if (!confirm(`MLS# ${mls} already exists in tracker (${existing.address}). Save anyway?`)) return;
    }
  }

  const data = {
    mls,
    address: document.getElementById('address').value.trim(),
    city: document.getElementById('city').value.trim(),
    state: document.getElementById('state').value,
    status: document.getElementById('status').value,
    price: numOrNull('price'),
    beds: numOrNull('beds'),
    baths: numOrNull('baths'),
    sqft: numOrNull('sqft'),
    lotSize: numOrNull('lotSize'),
    yearBuilt: numOrNull('yearBuilt'),
    url: document.getElementById('url').value.trim(),
    hoaConfirmed: document.getElementById('hoaConfirmed').value,
    notes: document.getElementById('notes').value.trim(),
    lastChecked: Date.now(),
  };

  let record;
  if (id) {
    const idx = listings.findIndex(l => l.id === id);
    if (idx === -1) return;
    record = { ...listings[idx], ...data };
    listings[idx] = record;
  } else {
    record = { id: uid(), dateAdded: Date.now(), ...data };
    listings.push(record);
  }

  try {
    await Storage.upsert(record);
  } catch (err) {
    alert('Save failed: ' + err.message + '\nThe change is in memory but not persisted. Try again.');
  }
  render();
  closeModal();
}

function numOrNull(id) {
  const v = document.getElementById(id).value;
  return v === '' ? null : Number(v);
}

async function deleteListing() {
  const id = document.getElementById('listing-id').value;
  if (!id) return;
  if (!confirm('Delete this listing?')) return;
  listings = listings.filter(l => l.id !== id);
  try {
    await Storage.remove(id);
  } catch (err) {
    alert('Delete failed: ' + err.message);
  }
  render();
  closeModal();
}

function exportJson() {
  const blob = new Blob([JSON.stringify({ schema: SCHEMA_VERSION, listings }, null, 2)], { type: 'application/json' });
  download(blob, `no-hoa-listings-${todayStr()}.json`);
}

function exportCsv() {
  const cols = ['mls', 'address', 'city', 'state', 'status', 'price', 'beds', 'baths', 'sqft', 'lotSize', 'yearBuilt', 'url', 'hoaConfirmed', 'notes', 'dateAdded', 'lastChecked'];
  const header = cols.join(',');
  const rows = listings.map(l => cols.map(c => csvCell(l[c])).join(','));
  const blob = new Blob([header + '\n' + rows.join('\n')], { type: 'text/csv' });
  download(blob, `no-hoa-listings-${todayStr()}.csv`);
}

function csvCell(v) {
  if (v == null) return '';
  const s = String(v);
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function download(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}

function importJson(file) {
  const reader = new FileReader();
  reader.onload = async () => {
    try {
      const parsed = JSON.parse(reader.result);
      const data = Array.isArray(parsed) ? parsed : parsed.listings;
      if (!Array.isArray(data)) throw new Error('expected array of listings');
      if (!confirm(`Import ${data.length} listings? Merges with existing data.`)) return;
      const existingIds = new Set(listings.map(l => l.id));
      const fresh = [];
      data.forEach(l => {
        const item = migrate(l);
        if (!item.id || existingIds.has(item.id)) item.id = uid();
        if (!item.dateAdded) item.dateAdded = Date.now();
        listings.push(item);
        fresh.push(item);
      });
      await Storage.bulkUpsert(fresh);
      render();
    } catch (err) {
      alert('Import failed: ' + err.message);
    }
  };
  reader.readAsText(file);
}

function lookupMls() {
  const q = els.mlsLookup.value.trim();
  if (!q) {
    els.mlsLookupResult.innerHTML = '';
    els.mlsLookupResult.className = 'lookup-result';
    return;
  }
  // Try MLS# in URL (Redfin URLs end in /home/<id> but MLS# is usually shown in listing body, not URL).
  // So we match MLS# field, then fall back to URL substring match.
  const mlsMatch = listings.find(l => l.mls && l.mls === q);
  const urlMatch = !mlsMatch && listings.find(l => l.url && (l.url === q || (q.startsWith('http') && l.url.includes(q))));
  const hit = mlsMatch || urlMatch;
  if (hit) {
    els.mlsLookupResult.innerHTML = `
      <strong>Already tracked:</strong> ${escapeHtml(hit.address)} · ${escapeHtml(locationLabel(hit))}
      · <span class="badge badge-${hit.status}">${STATUS_LABELS[hit.status]}</span>
      · checked ${fmtDate(hit.lastChecked || hit.dateAdded)}
      · <a href="#" data-open-id="${hit.id}">open ↗</a>
    `;
    els.mlsLookupResult.className = 'lookup-result hit';
    els.mlsLookupResult.querySelector('[data-open-id]')?.addEventListener('click', e => {
      e.preventDefault();
      openModal(hit.id);
    });
  } else {
    els.mlsLookupResult.innerHTML = `<strong>Not in tracker.</strong> <a href="#" id="quick-add">+ Add it</a>`;
    els.mlsLookupResult.className = 'lookup-result miss';
    document.getElementById('quick-add')?.addEventListener('click', e => {
      e.preventDefault();
      openModal();
      const looksUrl = q.startsWith('http');
      document.getElementById(looksUrl ? 'url' : 'mls').value = q;
    });
  }
}

els.addBtn.addEventListener('click', () => openModal());
els.modalClose.addEventListener('click', closeModal);
els.cancelBtn.addEventListener('click', closeModal);
els.deleteBtn.addEventListener('click', deleteListing);
els.form.addEventListener('submit', handleSubmit);
els.modal.addEventListener('click', e => { if (e.target === els.modal) closeModal(); });

[els.filterState, els.filterStatus, els.sortBy, els.search].forEach(el =>
  el.addEventListener('input', render)
);

els.mlsLookup.addEventListener('input', lookupMls);

els.stateJump.addEventListener('change', e => {
  const stateName = e.target.value;
  if (stateName) {
    window.open(`https://www.redfin.com/state/${encodeURIComponent(stateName)}`, '_blank', 'noopener');
    e.target.value = '';
  }
});

els.exportJson.addEventListener('click', exportJson);
els.exportCsv.addEventListener('click', exportCsv);
els.importBtn.addEventListener('click', () => els.importFile.click());
els.importFile.addEventListener('change', e => {
  if (e.target.files[0]) importJson(e.target.files[0]);
  e.target.value = '';
});

document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && !els.modal.hidden) closeModal();
});

function renderBackendStatus() {
  const el = document.getElementById('backend-status');
  if (!el) return;
  if (Storage.mode === 'api') {
    el.innerHTML = `<span class="status-dot ok"></span> SQLite connected`;
    el.title = 'Data is being saved to the SQLite database via the backend.';
  } else {
    el.innerHTML = `<span class="status-dot warn"></span> localStorage (offline)`;
    el.title = 'Backend not reachable — using browser localStorage. Run `npm start` to enable SQLite.';
  }
}

async function offerLocalStorageMigration() {
  if (Storage.mode !== 'api') return;
  const local = readLocalStorage();
  if (!local.length) return;
  const existingIds = new Set(listings.map(l => l.id));
  const newOnes = local.filter(l => !existingIds.has(l.id));
  if (!newOnes.length) return;
  const btn = document.getElementById('migrate-btn');
  if (btn) {
    btn.hidden = false;
    btn.textContent = `Sync ${newOnes.length} from localStorage →`;
    btn.onclick = async () => {
      if (!confirm(`Copy ${newOnes.length} listing(s) from localStorage into SQLite?`)) return;
      try {
        await Storage.bulkUpsert(newOnes);
        listings = await Storage.load();
        render();
        if (confirm('Migration done. Clear localStorage so this prompt stops appearing?')) {
          localStorage.removeItem(STORAGE_KEY);
        }
        btn.hidden = true;
      } catch (err) {
        alert('Migration failed: ' + err.message);
      }
    };
  }
}

function handleHashAdd() {
  const hash = location.hash;
  if (!hash.startsWith('#add=')) return;
  const payload = hash.slice(5);
  history.replaceState(null, '', location.pathname + location.search);
  let data;
  try {
    data = JSON.parse(decodeURIComponent(escape(atob(payload))));
  } catch (err) {
    alert('Could not decode bookmarklet payload: ' + err.message);
    return;
  }

  // Already in tracker? Open the existing record instead of creating a duplicate.
  if (data.mls) {
    const existing = listings.find(l => l.mls && l.mls === data.mls);
    if (existing) {
      alert(`MLS# ${data.mls} is already tracked (status: ${STATUS_LABELS[existing.status]}). Opening existing record.`);
      openModal(existing.id);
      return;
    }
  }
  if (data.url) {
    const existing = listings.find(l => l.url && l.url === data.url);
    if (existing) {
      alert(`This Redfin URL is already tracked (status: ${STATUS_LABELS[existing.status]}). Opening existing record.`);
      openModal(existing.id);
      return;
    }
  }

  openModal();
  const setIf = (id, v) => { if (v != null && v !== '') document.getElementById(id).value = v; };
  setIf('mls', data.mls);
  setIf('address', data.address);
  setIf('city', data.city);
  setIf('state', data.state);
  setIf('price', data.price);
  setIf('beds', data.beds);
  setIf('baths', data.baths);
  setIf('sqft', data.sqft);
  setIf('lotSize', data.lotSize);
  setIf('yearBuilt', data.yearBuilt);
  setIf('url', data.url);
  setIf('hoaConfirmed', data.hoaConfirmed);
}

async function init() {
  await Storage.init();
  renderBackendStatus();
  try {
    listings = await Storage.load();
  } catch (err) {
    console.error('Initial load failed', err);
    listings = readLocalStorage();
  }
  renderPinned();
  render();
  handleHashAdd();
  offerLocalStorageMigration();
}

init();
