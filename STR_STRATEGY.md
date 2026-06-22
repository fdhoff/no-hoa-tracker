# STR Strategy & Learnings

## Henderson, NV (Clark County)
*   **The 1,000ft Rule:** STR permits are prohibited if another active permit is within 1,000 feet. This is the #1 reason "No-HOA" homes in Henderson still fail.
*   **HOA Verification:** Even when Redfin says "No HOA," many 1990s-2000s builds in Henderson have "Ghost HOAs" or LIDs/SIDs that act as restrictions.
*   **ROI Potential:** Generally lower than TN due to higher entry prices and stricter permit caps.
*   **Map Automation:** Use `.codex/skills/henderson-str-eligibility/scripts/check_henderson_str.cjs` to check Henderson addresses against the public STVR ArcGIS REST layers: city limits, prohibited areas, 1,000 ft STVR buffers, 2,500 ft resort hotel buffers, registered STVR parcels, and parcels/APNs.
*   **Map Caveat:** Henderson says the public STVR map is informational and not the final eligibility determination for unregistered homes. Final location eligibility is determined when a complete application is submitted; for close calls, get a land survey or written city guidance.
*   **Current No-HOA Market Scan (2026-05-07):** Redfin reported 108 Henderson "No HOA" results. After removing 3 Las Vegas spillovers and 20 vacant-land listings, 85 Henderson homes remained. The ArcGIS screen found 7 location-pass homes and 78 location-fail homes; every failed home hit the 1,000 ft STVR separation buffer, and one also hit a resort hotel buffer.
*   **Duplex/Multi-Unit Rule:** Do not underwrite a duplex as STR-qualified just because it passes the map. Henderson code says dwelling units in a multi-unit dwelling structure cannot be used as STVRs unless mapped for individual ownership. Multi-unit structures are capped at 10 percent of residential units, each STVR needs a separate registration, and the 1,000 ft separation exemption applies only to individually mapped units under that cap.
*   **207 S Texas Ave Finding:** `207 S Texas Ave` passed the location screen (APN `17918710183`, no 1,000 ft/prohibited/resort-hotel blocker), but Redfin identifies it as a duplex / multi-family 2-4 unit. Treat it as city-confirm-required, not green-lit, unless the target unit is individually mapped for ownership or Henderson confirms whole-property registration is acceptable.

## Sevier County, TN (Sevierville / Wears Valley)
*   **Zoning Nuance (CRITICAL):** 
    *   **City Limits:** R-1 is usually "No STR."
    *   **Unincorporated (County):** R-1 is "Yes STR" (with a permit). Wears Valley is mostly unincorporated.
*   **Septic is King:** Occupancy is not determined by bedroom count in the listing, but by the **Septic Permit** on file with the county. A 4-bed house with a 2-bed septic is legally a 2-bed STR.
*   **2024 Fire Code:** All cabins now require a $250 annual permit and a fire inspection (interconnected alarms are the biggest fail point for older cabins).
*   **ROI Heuristic:** 
    *   3-Bed Cabins: ~$60k (Avg) to $85k+ (High Performance) gross.
    *   Operating Expenses: ~40-45% (including 20% management).
    *   Target Cap Rate: 7.5%+.

## Pre-Calculation Logic for Dashboard
To avoid wasting time, we will use the following heuristics for TN properties:
1.  **Est. Annual Revenue:** $25,000 * [Bedroom Count] (Conservative)
2.  **Net Income:** Revenue * 0.55 (Assuming 45% OpEx)
3.  **Cap Rate:** Net Income / Purchase Price
