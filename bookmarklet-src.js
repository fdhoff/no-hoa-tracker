// Source for the "+ to No-HOA Tracker" bookmarklet.
// This file is for reading; the install page (bookmarklet.html) bundles a minified
// version into a javascript: URL. Edit here, then re-paste into bookmarklet.html
// (or just rely on the version in bookmarklet.html — they should stay in sync).

(function () {
  const TRACKER_URL = '__TRACKER_URL__'; // replaced at install time

  const text = document.body.innerText || '';

  function pickRegex(re, group = 1) {
    const m = text.match(re);
    return m ? m[group].trim() : null;
  }

  function num(s) {
    if (s == null) return null;
    const v = parseFloat(String(s).replace(/[^\d.]/g, ''));
    return Number.isFinite(v) ? v : null;
  }

  function tryQS(selectors) {
    for (const s of selectors) {
      const el = document.querySelector(s);
      if (el && el.textContent.trim()) return el.textContent.trim();
    }
    return null;
  }

  // Address — try a few known Redfin testids, then h1
  const address = tryQS([
    '[data-rf-test-id="abp-streetLine"]',
    '.street-address',
    'h1.homeAddress',
    'h1',
  ]);

  // Price
  const priceText = tryQS([
    '[data-rf-test-id="abp-price"] .statsValue',
    '[data-rf-test-id="abp-price"]',
    '.statsValue.price',
    '.price',
  ]);
  const price = num(priceText);

  // Beds / Baths / Sqft from the stats row
  const beds = num(tryQS([
    '[data-rf-test-id="abp-beds"] .statsValue',
    '.beds-section .statsValue',
  ]));
  const baths = num(tryQS([
    '[data-rf-test-id="abp-baths"] .statsValue',
    '.baths-section .statsValue',
  ]));
  const sqft = num(tryQS([
    '[data-rf-test-id="abp-sqFt"] .statsValue',
    '.sqft-section .statsValue',
  ]));

  // Fallbacks via page text
  const mls = pickRegex(/MLS\s*#?\s*[:#]?\s*([A-Z0-9-]+)/i);
  const yearBuilt = num(pickRegex(/Year Built[:\s]+(\d{4})/i));
  const lotSize = (() => {
    // "Lot Size: 0.25 Acres" or "Lot Size: 10,890 Sq. Ft."
    const acres = pickRegex(/Lot Size[:\s]+([\d.,]+)\s*Acres/i);
    if (acres) return parseFloat(acres.replace(/,/g, ''));
    const sq = pickRegex(/Lot Size[:\s]+([\d.,]+)\s*Sq/i);
    if (sq) return Math.round((parseFloat(sq.replace(/,/g, '')) / 43560) * 100) / 100;
    return null;
  })();

  // HOA detection
  const hoaMatch = text.match(/HOA[^.\n]{0,40}?(\$[\d,]+|None|No HOA|0\b)/i);
  let hoaConfirmed = 'unverified';
  if (hoaMatch) {
    const v = hoaMatch[0].toLowerCase();
    if (v.includes('none') || v.includes('no hoa') || /\$0\b/.test(v) || / 0\b/.test(v)) {
      hoaConfirmed = 'yes';
    } else if (/\$[1-9]/.test(v)) {
      hoaConfirmed = 'has-hoa';
    }
  }

  // City + state from address bar (Redfin usually shows "Address, City, ST ZIP")
  let city = null, state = null;
  const cityStateMatch = text.match(/,\s*([A-Za-z .'-]+),\s*([A-Z]{2})\s*\d{5}/);
  if (cityStateMatch) {
    city = cityStateMatch[1].trim();
    state = cityStateMatch[2];
  }

  const data = {
    address: address || '',
    city: city || '',
    state: state || '',
    price: price || null,
    beds: beds,
    baths: baths,
    sqft: sqft,
    lotSize: lotSize,
    yearBuilt: yearBuilt,
    mls: mls || '',
    url: location.href,
    hoaConfirmed,
    notes: '',
  };

  const payload = btoa(unescape(encodeURIComponent(JSON.stringify(data))));
  window.open(TRACKER_URL + '#add=' + payload, '_blank');
})();
