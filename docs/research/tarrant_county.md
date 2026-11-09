Tarrant County does not offer a single, unified REST API specifically designed to pull full historical ownership chains by address. However, the county's real estate records and appraisal rolls are split across three primary data repositories that provide the necessary information.
1. The Three Tarrant County Historical Ownership Sources
A. Tarrant County Deed History Cards (1876–1984)
Before the appraisal district was established in 1980, Tarrant County maintained physical ledger cards for every property parcel. These have been scanned and made available online for free.
• What it contains: Every recorded transaction (grantor/grantee names, deed types, deed dates, volume/page numbers, and tax valuations) from 1876 to 1984.
• How to query: Accessible via the Tarrant County Deed History Card Portal. Searches are conducted by Subdivision Name, Block, and Lot (or street name) rather than modern zip codes.
B. Tarrant Appraisal District (TAD) Bulk Data (1984–Present)
TAD handles modern property appraisals and current/recent ownership records.
• Bulk Data Downloads: TAD provides raw data downloads (in CSV/TSV format) and GIS Spatial Data (Shapefiles/GeoJSON) on their public portal (tarrant.prodigycad.com or tad.org).
• What it contains: Parcel Account IDs (RCN), property addresses, current owner, deed transfer dates, legal descriptions, and building construction years.
• Internal CAD Endpoints: The TAD web search interface operates on underlying JSON endpoints. When searching an address in the browser, the frontend calls backend endpoints (e.g., returning property detail objects including recent deed transfer histories).
C. Tarrant County Clerk Official Public Records (CountyFusion)
The County Clerk maintains the legal recorded land deeds, mortgages, and title transfers.
• Portal: Tarrant County Clerk Online Services / CountyFusion.
• What it contains: Watermarked PDF copies of actual Warranty Deeds and Quitclaim Deeds containing exact signatures, grantor (seller), and grantee (buyer) details.
• Access: Unofficial watermarked copies can be downloaded free after creating an account.
2. Recommended Data Ingestion Strategy
To build an automated lookup table of Address \rightarrow Legal Description \rightarrow Owner History, follow a three-stage indexing workflow:
[Address List] 
      │
      ▼
[1. TAD Bulk Export / GIS] ──▶ Extracts Account ID (RCN) & Legal Desc (Lot/Block)
      │
      ▼
[2. Index Deed Cards (1876-1984) & TAD Transfers (1984+)]
      │
      ▼
[3. Local DB: Address ── Owner Timeline ── Date Range]

Step 1: Map Address to Legal Description
Address-based searches often fail on older historical documents because street names or house numbers changed over time.
• Download TAD’s bulk property appraisal roll or GIS parcel layers.
• Query by street address to extract: • Account Number (RCN) • Legal Description: Subdivision Name, Block Number, Lot Number (e.g., PARK HILL ADDITION Block 4 Lot 12).
Step 2: Extract Modern Chain of Title (1984–Present)
• Run a script against the TAD bulk text files or query internal CAD endpoints using the RCN.
• Parse the deed_history or transfer_history blocks to extract: • Grantee name (buyer) • Deed record date • Instrument number / Volume & Page
Step 3: Extract Early Chain of Title (1876–1984)
• Use the Legal Description (Subdivision + Lot/Block) to pull matching digitized Deed History Cards.
• Pass scanned card image text or card index data into your LLM parser to extract structured entries: {   "address": "2401 Medford Ct",   "legal_description": "Park Hill Addn Blk 2 Lot 4",   "owners": [     {"name": "Arthur B. Willis", "role": "Grantee", "date": "1926-04-12", "doc_type": "Warranty Deed"},     {"name": "Charles E. Mitchell", "role": "Grantee", "date": "1941-09-03", "doc_type": "Warranty Deed"}   ] }

## Local TAD Export

The downloaded `2026-11-06_2026_APPRAISAL_INFO.TXT` is a fixed-width property file. Its layout is documented by `Legacy8.0.33-AppraisalExportLayout.xlsx`, Property tab. The `abs_subdv_cd` field is at byte positions 1676-1685; lookup code `31620` in `2026-11-06_2026_APPRAISAL_ABSTRACT_SUBDV.TXT` resolves to `PARKHILL ADDITION (FT WORTH)`. `situs_num` is stored separately at positions 4460-4474.

Extract just this subdivision with:

```sh
bun run research:extract-tad
```

The default input is `data-research/tarrant_county/000_Tarrant_All_Taxing_Units/2026-11-06_2026_APPRAISAL_INFO.TXT`. The script streams the file and writes selected owner, address, legal-description, deed-reference, appraisal-year, and supplement fields to `data-research/tarrant_county/parkhill_property_records.jsonl`; it does not load the 14 GB source into memory or change the source file. Optional positional arguments are input path, output path, and subdivision code.

Initial extraction scanned 1,411,779 records and found 147 records for subdivision 31620. All 141 addresses in `research_export.csv` matched exactly once; six additional subdivision records do not match that address list. Of the 141 matched rows, 135 are certified-roll records and six have nonzero supplement numbers. The six supplemental rows have blank supplement-action fields, so review them before deciding whether they supersede certified data. Some deed dates are blank, and `12-31-1900` appears as a placeholder; do not treat it as a valid transfer date.

The smaller `PropertyData(Delimited)_R.txt` includes convenient owner/address/deed columns, but a text search for `PARK HILL` yields unrelated additions (including Euless). Use the subdivision code for this neighborhood instead. The large `APPRAISAL_ENTITY_INFO.TXT` file is not needed for this property/owner extraction. This appraisal roll is a current-year snapshot with deed references, not a complete chain of title; retain it as an unverified source and use recorded deeds to establish historical ownership.

## Import Certified Rows to the Research Database

Preview the match and review counts without database writes:

```sh
bun run research:import-tad
```

Apply the import after reviewing the preview:

```sh
bun run research:import-tad --apply
```

The importer links records by normalized situs address, imports only matched rows with supplement number `0`, and leaves all claims unverified. It stores the TAD deed date separately from an ownership-period start date, which this export does not establish. Deterministic record IDs make repeated imports non-duplicating; existing records are not overwritten.

For the current export, the preview reports 135 certified owner records matched to 135 addresses, six addresses represented only by supplemental rows, and seven supplemental rows total (one is outside the research address list). Supplemental rows are not imported. Review their action and select the valid current record before adding them. Six certified rows have no usable deed date; invalid `1900` placeholders are stored as null.

3. Combining Ownership Data with Newspaper Archives
Once your local database contains the mapped list of historical owner names and active dates per house, your LLM archive search script can run targeted cross-queries:
1. Combined Search Queries: Instead of searching newspapers for "2401 Medford", search for "{Owner Name}" AND "Fort Worth" constrained to "{Deed Start Year}" TO "{Deed End Year}".
2. Context Matching: When a newspaper match is found for an owner name during their period of homeownership, link that news article directly to the property parcel record in your database.