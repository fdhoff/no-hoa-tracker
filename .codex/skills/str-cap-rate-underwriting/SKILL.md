---
name: str-cap-rate-underwriting
description: Compare short-term-rental properties using clean gross yield, adjusted revenue, estimated NOI, and cap-rate ranges. Use when the user asks for STR cap rates, gross yield, underwriting, ROI, owner payout comparison, revenue statement interpretation, or to compare properties like Gatlinburg, Pigeon Forge, Sevierville, Las Vegas, Henderson, or existing STR homes.
---

# STR Cap Rate Underwriting

Use this skill to turn messy STR statements, listing claims, screenshots, PDFs, or user-provided revenue notes into a concise property comparison.

## Workflow

1. Identify the basis:
   - Use purchase price when the user says "purchased for" or gives a cost basis.
   - Use current asking price only for acquisition candidates.
   - State which one you used.
2. Classify revenue quality:
   - **Actual**: owner statement, platform export, tax/reporting screenshot, or listing-stated historical gross.
   - **Adjusted actual**: taxable/gross line adjusted for cleaning, pet fee, damage protection, platform fees, or owner payout.
   - **Projection**: AirDNA, property manager estimate, listing projection, or "can do" language.
3. Normalize the revenue:
   - Show gross revenue when available.
   - Separate pass-through cleaning fees from nightly rent when the source makes them visible.
   - Treat owner payout as revenue after platform/manager deductions, not as NOI unless property-level expenses are already included.
4. Estimate NOI only after deciding which expenses are missing.
   - If no real expense statement is available, use a range and say it is modeled.
   - Typical modeled NOI margin:
     - Self-managed / light management: 50%-60% of gross or adjusted gross.
     - Managed STR: 40%-50% of gross.
     - Condo-hotel / high HOA: model after HOA/manager drag, often 30%-45%.
5. Compute:
   - `Gross yield = gross revenue / basis`
   - `Adjusted revenue yield = adjusted revenue or owner payout / basis`
   - `Cap rate = estimated NOI / basis`

## Output Style

Lead with the clean table. Keep the notes short.

Use this shape:

| Property | Basis | Gross | Adjusted Revenue / Owner Payout | Est. NOI | Cap Rate |
|---|---:|---:|---:|---:|---:|
| Example | $725k | $105,567 | ~$80,311 adjusted rent/fees | ~$50k-$62k | 6.9%-8.6% |

Then state the winner and one or two reasons.

## Interpretation Rules

- Do not call taxable income NOI without the expense detail.
- Cleaning fees collected are not automatically profit. If actual cleaner cost is unknown, treat the cleaning spread as unknown upside.
- Pet fees and retained damage-protection fees are economic income if the owner keeps them, but still account for related costs/risk.
- Owner payout from a manager/platform is not final NOI if taxes, insurance, utilities, maintenance, supplies, HOA, pest, lawn, pool, hot tub, and capex are still missing.
- Gross yield above 15% is interesting; above 20% is usually an outlier or projection and needs verification.
- Prefer actual trailing 12-months over projections. If both exist, show actual first and projection as upside.

## Required Caveats

If source data is incomplete, explicitly say "modeled" or "not true cap rate yet."

For STR legality, zoning, HOA, permits, septic/occupancy, or city buffers, use the relevant local eligibility skill or public permitting source before treating revenue as underwritable.

## References

- Existing Henderson property baselines: `references/property-baselines.md`
