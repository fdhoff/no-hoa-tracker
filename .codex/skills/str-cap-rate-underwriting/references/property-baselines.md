# Property Baselines

Use these only as starting facts. Revenue still needs owner statements, platform exports, or modeled assumptions.

## Henderson, NV Existing Properties

| Property | Basis / Source | Physical Notes | STR Map Status as of 2026-05-30 | Notes |
|---|---:|---|---|---|
| 1194 Golden Spike Ct, 89014 | $625,000 sale on 2023-09-08 | 5 bd / 3 ba / 3,018 sqft, pool/spa, 3-car, solar | Registered active STVR parcel; also inside its own 1000 ft STVR buffer | Registration #11326. Has HOA per Zillow/Redfin data; verify rental restrictions and transfer/renewal status. |
| 415 W Atlantic Ave, 89015 | $295,000 sale on 2026-01-07 | 2 bd / 1 ba / 872 sqft | Registered active STVR parcel; inside its own 1000 ft STVR buffer | Registration #081329. Low basis; needs actual revenue to evaluate. |
| 7 Sturm St, 89015 | $431,500 sale on 2026-05-11 per Redfin sale page; tracker stale price $449,000 | 4 bd / 2 ba / 1,898 sqft | Current script result: eligible, no 1000 ft/prohibited/resort blocker | Prior tracker note said 2026-05-08 ineligible; re-check map before relying. |

## Example Interpretation

- Registered active STVR parcels may show as "not eligible" in simple map output because they are inside an existing 1000 ft buffer, including their own. Treat that differently from an unregistered acquisition candidate.
- For unregistered properties, "inside1000FtBuffer: true" is usually a blocker unless a city-specific exception applies.
- Use purchase basis for owned properties and asking price for acquisition candidates.
