# HOA & STR Absolute Certainty Guide

This protocol ensures 100% verification of HOA status and Short-Term Rental (STR) eligibility.

## 1. How to Pull the Deed (The Legal Truth)

### Step 1: Get the Legal Description
1.  Go to the **County Assessor** (links below).
2.  Search by address.
3.  Note the **Parcel ID (APN)** and the **Legal Description** (e.g., "Lot 4, Block 2 of Sunset Acres").
4.  Look for the **"Instrument Number"** or **"Book and Page"** of the most recent Warranty Deed.

### Step 2: Download the Deed
1.  Go to the **Register of Deeds / Recorder** (links below).
2.  Enter the Instrument Number or search by the Parcel ID.
3.  Download the **Warranty Deed** and the **CC&Rs** (Covenants, Conditions, and Restrictions).
4.  **Verification**: If the deed mentions "Subject to Covenants of Record," you must find the document referenced and ensure it doesn't mention a mandatory HOA or "No rentals under 30 days."

---

## 2. STR Eligibility Portals

### **Henderson, NV (Clark County)**
*   **The Deed**: [Clark County Recorder](https://recorder.clarkcountynv.gov/)
*   **The Map**: [City of Henderson STVR Page](https://www.cityofhenderson.com/government/departments/community-development-and-services/short-term-vacation-rentals) and [Registered STVR ArcGIS Map](https://hendersonnv.maps.arcgis.com/apps/webappviewer/index.html?id=cfcb445a82a34c0786b14eb100d8a04e)
    *   *Verification*: Search the address on this map. If it falls in a "Prohibited" zone or is within 1,000ft of another permit, it is NOT eligible regardless of HOA status.
    *   *Automation*: From the repo root, run `node .codex/skills/henderson-str-eligibility/scripts/check_henderson_str.cjs "ADDRESS, Henderson, NV"`.
    *   *Caveat*: Henderson states the public map is informational and not the final eligibility determination for currently unregistered property. Final distance eligibility is determined during application review.
*   **The Code**: Henderson Development Code section `19.9.4.F` / STVR Standards and Regulations.
    *   *Multi-unit rule*: Unless mapped for individual ownership, dwelling units in a multi-unit dwelling structure cannot be used as STVRs. Do not rely on the map alone for duplexes, townhomes, condos, or other multi-unit structures.
    *   *Multi-unit cap*: STVRs in a multi-unit dwelling structure or mixed-use building are limited to 10% of residential units, and each STVR requires a separate registration.

### **Gatlinburg / Sevierville, TN (Sevier County)**
*   **The Deed**: [Sevier County Register of Deeds](https://www.seviercountytn.gov/government/register_of_deeds/index.php)
*   **The Zoning**: [Sevier County GIS Map](http://www.seviercountytn.gov/government/assessor_of_property/index.php)
    *   *Verification*: Click on the property. If the zone is **R-1**, it is strictly residential (No STR). Look for **R-2, C-2, or A-1** (Agricultural often allows cabins).
*   **City vs. County**: If the home is in the **City of Gatlinburg**, you must also verify the "Overnight Rental Permit" availability with the Planning Dept.

### **Maryville, TN (Blount County)**
*   **The Deed**: [Blount County Register of Deeds](https://blounttn.org/272/Register-of-Deeds)
*   **The Zoning**: [Blount County GIS Map](https://www.blounttn.org/175/GIS-Mapping)
    *   *Tip*: Properties in "County Only" (outside Maryville city limits) have the most freedom, but still check for private road maintenance agreements on the deed.

---

## 3. The "No-HOA" Red-Flag Checklist
Before you pay for a title search, look for these "Ghost HOAs":
1.  **Shared Amenities**: Is there a community pool or park? If yes, an HOA exists.
2.  **Private Roads**: If the street is private, there is an HOA or a Road Maintenance Agreement (RMA) which acts like a small HOA.
3.  **LID/SID (Henderson Specific)**: Even with no HOA, Henderson often has "Limited Improvement Districts." These show up on your tax bill and can cost $500–$2,000/year.
