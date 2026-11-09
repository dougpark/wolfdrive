# Park Hill Research Implementation Plan

## Part 1 Goal

Establish a durable, source-aware property research workspace. The initial address export is a set of research targets, not proof of residency or ownership. Every later owner or historical event should retain its citation and verification status.

## Implementation Sequence

1. **Database foundation**
   - Keep all definitions in `src/db/schema.ts` and changes in generated Drizzle migrations.
   - Store research addresses separately from ownership claims and historical events.
   - Store source name, type, URL, citation, and retrieval date so claims remain auditable.

2. **Address bootstrap**
   - Import `data-prod/research_export.csv` using `bun run research:import-addresses`.
   - Use the short address as the stable upsert key; preserve the two supplied names as unverified CSV values.
   - Reject malformed rows and duplicate short addresses. Derive only known missing code patterns and report the count.

3. **Tarrant County records intake**
   - Confirm an authorized Tarrant Appraisal District / County Clerk source and an export or API format before automating retrieval.
   - Map each owner record to the research address, parcel identifier, date range, deed reference, and source citation.
   - Keep imported records unverified until deed/property evidence has been reviewed. Do not treat a current assessor record as a complete historical chain of title.

4. **Research workspace**
   - Add Research navigation and a master/detail address view.
   - Search addresses, imported names, property owners, event text, and event type.
   - Show CSV names, county ownership claims, and historical mentions in separate sections with explicit empty and unverified states.

5. **Part 1 acceptance checks**
   - A fresh migration creates the research tables without altering media data.
   - Re-running the address import leaves one row per short address and updates only the CSV-sourced fields.
   - All 141 source rows appear in the address list; a resident/address search and event-type filter work.
   - Address detail shows sourced ownership and event records when present, and makes missing research visible.

## Follow-On Work

- **Part 2:** Compare newspaper evidence against deeds/property records, record conflicting evidence, and promote claims to verified only with a citation.
- **Open archives:** Add source adapters for the Portal to Texas History and Chronicling America after confirming current API response formats, terms, and rate limits.
- **AI enrichment:** Preserve raw OCR alongside extracted fields, record model/prompt/version and confidence, and require human review before verification.
- **Discovery:** Add cross-address/person timelines and hybrid lexical/semantic search only after source records and extraction quality are established.

## Current Boundary

The repository contains the address CSV but no Tarrant County property-record export, parcel IDs, credentials, or confirmed API contract. Part 1 provides the schema and UI for sourced owner history; fetching actual county records remains gated on choosing and obtaining an authorized source dataset.
