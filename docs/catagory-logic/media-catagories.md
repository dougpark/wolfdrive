This semantic model maps raw file signatures and MIME types to human-friendly primary categories and user-generated sub-categories.

image media
![Hierarchical diagram of media categories showing primary categories including audio, video, and image with nested subcategories such as audiobook, podcast, TV show, movie, photo, and artwork](/home/dougpark/projects/wolfdrive/docs/catagory-logic/core-media-catagories.png)

image documents
![Hierarchical diagram of document categories showing primary classification with subcategories including PDF, Word documents, spreadsheets, presentations, and text files organized in a tree structure](/home/dougpark/projects/wolfdrive/docs/catagory-logic/documents-categories.png)


Recommended Data Model Schema (TypeScript)
When storing these items in SQLite or managing them in Vue, decouple the raw system metadata from the semantic user view:


Auto-Classification Logic
1. MIME / Extension Matching: Derive the primaryCategory automatically based on MIME type or extension (e.g., audio/* \rightarrow audio).
2. Heuristic Sub-Classification: Default subCategory using extension or path heuristics: • .m4b or folder named /Audiobooks/ \rightarrow Audiobook • .cbz / .cbr \rightarrow Comic Book • Video files with .nfo metadata or named S01E01 \rightarrow TV Show
3. User Overrides: Allow users to manually reassign sub-categories in the UI without altering underlying files on disk.


