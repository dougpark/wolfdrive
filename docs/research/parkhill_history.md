# Park Hill Research
- the goal is to research Park Hill neighbor history and past residents. Starting with the idea back in the 1920's. the land ownership, the development of the neighborhood, and the people who lived there over time.
- Search by street address to find historical residents and events associated with specific properties.
- Search by resident name to find the addresses and properties associated with specific individuals over time.
- look at published directories, such as city directories and telephone books, to trace residents and property ownership over time.
- Examine historical maps, like Sanborn Fire Insurance Maps, to understand the physical layout and changes in the neighborhood over the years.
- Review local government records, such as building permits and zoning documents, to track property modifications and development patterns.
- Search newspaper archives from the local and regional papers to find articles, announcements, and notices related to specific addresses and residents over time.
- such as the Fort Worth Star Telegram
- and the Fort Worth Press (1921–1975)
- And the News Tribune
- the newspaper archives at UNT (University of North Texas), which hosts digitized runs of many local Texas papers, including the Fort Worth Press and other regional publications.

## Project Overview

The neighbor’s site likely works by scraping, processing, and indexing historical newspaper archives into a database—a classic historical research workflow.
Historically, newspaper articles didn't just cover major events; local papers printed society notes, house sales, building permit announcements, dinner parties, and neighborhood visitors, often listing exact street addresses along with homeowner names.
Step 1: Where the Local Historical Data Lives
To build an automated historical lookup pipeline, you first need to know where the archives live and how they can be accessed.
Primary Newspaper Archives
• Newspapers.com (Ancestry / ProQuest): This is the single largest digitized archive for the Fort Worth Star-Telegram (spanning 1890s through modern times). It features OCR-scanned, full-text searchable pages. (Requires a subscription or institutional access).
• The Portal to Texas History (UNT Libraries): A free online archive created by the University of North Texas. It hosts digitized runs of many local Texas papers, including the Fort Worth Press (1921–1975)—which often ran human-interest and neighborhood stories that the Star-Telegram missed.
• GenealogyBank / NewspaperARCHIVE: Additional commercial databases holding regional Fort Worth papers and historical society announcements.
UTA Libraries Special Collections & Archives
• The Fort Worth Star-Telegram Photograph Collection: UTA holds over 179,000 print photos and millions of negatives from the Star-Telegram (spanning 1849–2003). While the physical photo morgue is at UTA, large subsets are digitized on MavMatrix (UTA’s digital repository).
• City Directories on Microfilm / Digital: UTA Special Collections houses historical Fort Worth City Directories on microform. City directories (like Polk Directories) are crucial because they published reverse-lookup address indexes starting in the 1920s, showing exactly who lived at a specific address in any given year.
Tarrant County & Local Records
• Tarrant County Deed Records & TAD Archives: Provides historical land ownership titles, original plot deeds, and construction year metadata.
• Sanborn Fire Insurance Maps (Library of Congress / UT Austin): Maps showing exact structural footprints, house numbering changes, and property boundaries for Fort Worth neighborhoods across the early 20th century.
Step 2: Extracting Names per Address (The Bootstrap Step)
Before searching newspaper archives for names, you need a mapping of Address \rightarrow Historical Resident Names. Searching a newspaper for a raw address like "2401 Medford Ct" often yields limited results because historical papers frequently named people, not structural street numbers.
1. City Directory Reverse Indexing: • Acquire scans or transcripts of Fort Worth City Directories (e.g., from 1920, 1930, 1940, 1950, 1960). • Parse the "Street and Avenue Guide" section (the reverse directory at the back of the book).
2. U.S. Federal Census Records (1920–1950): • Use census enumeration districts for Tarrant County/Fort Worth to extract head-of-household and family names tied to street names.
3. Structured Mapping Schema: Build a baseline local database (e.g., SQLite/D1) storing structured entities: {   "address": "2401 Medford Ct E",   "historical_residents": [     {"name": "John Doe", "years": "1928-1942"},     {"name": "Jane Smith", "years": "1943-1960"}   ] }
Step 3: Setting Up an Automated Search & LLM Pipeline
Because commercial sites like Newspapers.com use anti-scraping protections and paywalls, a fully automated direct web crawler against their live UI can hit rate limits or CAPTCHAs. The standard pattern for personal RAG/LLM historic pipelines follows three stages:
[Address & Resident List] 
         │
         ▼
[API / Scraper Search Script] ──▶ [Raw OCR Text & Images]
                                         │
                                         ▼
                               [LLM OCR Cleaning & Parsing]
                                         │
                                         ▼
                               [Vector/RAG Storage (D1/Vectorize)]

Stage A: Data Retrieval Automation
• For Open Archives (Portal to Texas History / Chronicling America): Use their public REST APIs or JSON endpoints. You can query terms programmatically (e.g., "Medford Court", "Winton Terrace", or resident names) and receive full OCR text along with page URLs.
• For Commercial Archives (Newspapers.com / GenealogyBank): • Option 1: Use custom scraping scripts (Playwright/Puppeteer) to execute structured searches and download clip text/metadata. • Option 2: Bulk export clipped articles if using an account that permits export, or ingest clipping text files manually into your pipeline.
Stage B: LLM OCR Refinement & Extraction
Historical OCR from early-20th-century newsprint is notoriously noisy (e.g., J0hn Smi1h or broken line wraps).
Pass the raw search snippets into a small LLM (or a serverless local worker) with a structured extraction prompt:
Extract all historical facts from this newspaper OCR text for the location or person.
Text: {{raw_ocr_text}}

Return JSON:
{
  "matched_address": "",
  "matched_names": [],
  "event_date": "YYYY-MM-DD",
  "event_type": "Social/Real Estate/Obituary/General",
  "summary": "Concise 2-sentence summary of the news item.",
  "clean_excerpt": "Corrected OCR text block."
}

Stage C: Vector Store & RAG Ingestion
Store the processed articles in a searchable index (e.g., Cloudflare D1 with Vectorize, SQLite with sqlite-vss, or DuckDB):
• Create embeddings for the cleaned article summaries.
• Tag each vector record with metadata: address, resident_name, date, source_url.
Step 4: Recommended System Architecture
To query the dataset naturally (e.g., "Show me all news stories and residents for 2400-2450 Medford Court between 1925 and 1950"):
1. Local Automation Script (Node/Python/Bun): • Iterates through a list of target neighborhood addresses. • Generates search term permutations ("2401 Medford", "2401 Medford Ave", "2401 Medford Court" + resident names). • Fetches search result pages from accessible archives.
2. LLM RAG Ingestion Pipeline: • Cleans OCR text and generates vector embeddings. • Saves metadata to your local DB / D1 edge database.
3. Web UI / Query Interface: • A frontend map or directory interface that queries the vector database using hybrid search (lexical address search + semantic embedding search) to render timelines for each home.

## Process

You don't need to sign up for dozens of accounts or manually click through search pages. You can retrieve 80% to 90% of the historical records automatically using free, zero-account public APIs and a bulk search strategy that drastically reduces the number of queries needed.
Strategy 1: Use Open Public APIs (Zero Accounts Required)
Several major archives provide completely open REST APIs that return structured JSON data with full-text OCR results without requiring an account, API key, or authentication.
1. The Portal to Texas History API (UNT)
The University of North Texas hosts thousands of local Texas newspapers, photo collections, and municipal records. Their API is completely open.
• Query Endpoint: [https://texashistory.unt.edu/search/?q=](https://texashistory.unt.edu/search/?q=)"Street+Name"&format=json
• How it works: You issue a standard GET request for a street name. The API returns JSON containing matching articles, full OCR text snippets, publication dates, and page URLs.
• Automation: A basic script can hit this endpoint, fetch all page results, and save the raw OCR text locally in seconds.
2. Chronicling America API (Library of Congress)
Hosts digitized historical newspapers from Texas and across the US up to 1963.
• Query Endpoint: [https://chroniclingamerica.loc.gov/search/pages/results/?terms=Medford+Court&format=json](https://chroniclingamerica.loc.gov/search/pages/results/?terms=Medford+Court&format=json)
• How it works: Returns JSON containing OCR text blocks (ocr_eng), newspaper titles, volume numbers, and dates.
Strategy 2: Search by Street Name Instead of Individual Addresses
Querying 100 individual house numbers (e.g., 2401 Medford, 2403 Medford, 2405 Medford) creates unnecessary overhead and misses articles where house numbers were mistyped or omitted.
1. Batch Query by Street: Send a single request for the entire street name (e.g., "Medford Court" or "Winton Terrace"). A single query will capture almost every historical mention of every house on that block.
2. LLM Extract in Bulk: Pass the raw search result pages into your local LLM script. Prompt the model to extract all mentions of house numbers, residents, and events in one pass.
Prompt Template:
Extract all home addresses, resident names, dates, and historical events from the following text block.

Text: {{raw_ocr_text_from_api}}

Return JSON list:
[
  {"address": "2401 Medford Ct", "resident": "John Doe", "year": "1932", "event": "Hosted neighborhood social club"},
  ...
]

Strategy 3: Bypassing Paywalls via Single-Sign-On Library Access
For paywalled services like Newspapers.com or ProQuest Historical Newspapers, you do not need to contact individual companies or buy private subscriptions.
• Fort Worth Public Library (FWPL) / University Cards: A standard FWPL library card (or university credentials if connected to UTA/TCU) grants free remote access to Ancestry.com Library Edition, ProQuest Historical Star-Telegram archives, and HeritageQuest through a single EZproxy login.
• Scripted Scraping over Proxy: If automating search retrieval via Playwright or Python, your script only needs to log in once through the library proxy portal at the start of the session to access all paywalled databases.
Minimalist Automated Pipeline
Rather than a complex manual endeavor, the entire collection process boils down to a single script execution:
[Target Street List] 
         │
         ▼
[Loop: Fetch JSON from UNT / LOC APIs]
         │
         ▼
[LLM Parse: Extract Address + Name + Event]
         │
         ▼
[Save to Local Database / JSON File]

This reduces what feels like weeks of manual web searching into a brief automated script run using completely open tools.

# Part 1
- setup a sqlite db to store the results
- use drizzle to define the database schema and interact with the SQLite database
- import the address from /data-prod/research_export.csv
- create the UI
- pull data from Tarrant County property records

# Tarrant County Data
- pull in previous property owners from Tarrant County property records

# UI
- create a new left column item called 'Research'
- create a new main content area to display research results
- list the addresses imported from the research_export.csv file
- display historical newspaper mentions and Tarrant County property records for each address
- allow users to click on an address to view detailed research results, including extracted events and ownership history
- allow users to search research results by address, resident name, or event type

# Part 2
- cross-reference with historical newspaper mentions to verify ownership and events associated with each property
- update the local database with verified information