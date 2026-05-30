# Property Baselines

Use these only as starting facts. Revenue still needs owner statements, platform exports, or modeled assumptions.

## Henderson, NV Existing Properties

| Property | Basis / Source | Physical Notes | STR Map Status as of 2026-05-30 | Notes |
|---|---:|---|---|---|
| 1194 Golden Spike Ct, 89014 | $625,000 sale on 2023-09-08 | 5 bd / 3 ba / 3,018 sqft, pool/spa, 3-car, solar | Registered active STVR parcel; also inside its own 1000 ft STVR buffer | Registration #11326. Has HOA per Zillow/Redfin data; verify rental restrictions and transfer/renewal status. |
| 415 W Atlantic Ave, 89015 | $295,000 sale on 2026-01-07 | 2 bd / 1 ba / 872 sqft | Registered active STVR parcel; inside its own 1000 ft STVR buffer | Registration #081329. Low basis; needs actual revenue to evaluate. |
| 7 Sturm St, 89015 | $431,500 sale on 2026-05-11 per Redfin sale page; tracker stale price $449,000 | 4 bd / 2 ba / 1,898 sqft | Current script result: eligible, no 1000 ft/prohibited/resort blocker | Prior tracker note said 2026-05-08 ineligible; re-check map before relying. |

## Henderson, NV Commercial / Non-STR Properties

| Property | Basis / Source | Physical Notes | Eligibility / Use Status | Notes |
|---|---:|---|---|---|
| 969 Empire Mesa Way, 89011 | $477,000 asking price per public broker flyer found 2026-05-30 | Industrial warehouse, about 7,113 rentable SF / 0.38 AC, IL zoning, no HOA, 5 grade-level doors, yard | Henderson STVR location layers show no map blockers, but land use is industrial/warehouse, not residential STR | User note: debt service covered at 6.5%. Model separately from STR cap rates. At 30-year amortizing 6.5%, annual debt service is about 7.58% of loan principal; at 80% LTV on $477k, DS is about $28.9k/yr. |

## Example Interpretation

- Registered active STVR parcels may show as "not eligible" in simple map output because they are inside an existing 1000 ft buffer, including their own. Treat that differently from an unregistered acquisition candidate.
- For unregistered properties, "inside1000FtBuffer: true" is usually a blocker unless a city-specific exception applies.
- Use purchase basis for owned properties and asking price for acquisition candidates.
