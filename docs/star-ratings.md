# Star Ratings as tags

# UI
- show 5 star outline icons in a small horizontal row
- allow user to click positions 1 to 5
- icons changed to filled in from left to right
- allow user to clear the rating by clicking the first star again
- Hover State: Provide visual feedback on hover (★ ★ ★ ☆ ☆) before the user clicks to confirm the rating.

## Show in FileBrowser for all category types
- create a new Rating column left of the type column
- show the star rating as filled and outlined stars (★ ★ ★ ☆ ☆)


## Action Menu
- add a new Rating item to the action menu 
- on hover show a submenu with 
  - 0 stars (☆ ☆ ☆ ☆ ☆)
  - 1 star (★ ☆ ☆ ☆ ☆)
  - 2 stars (★ ★ ☆ ☆ ☆)
  - 3 stars (★ ★ ★ ☆ ☆)
  - 4 stars (★ ★ ★ ★ ☆)
  - 5 stars (★ ★ ★ ★ ★)


## Tags
- create a tag for the item based on star rating
- 1 star is tag: 1-star
- 2 stars is tag: 2-star
- 3 stars is tag: 3-star
- 4 stars is tag: 4-star
- 5 stars is tag: 5-star

## Database-Level Enforcement (Enforce Mutually Exclusive Tags)

Database-Level Enforcement (Enforce Mutually Exclusive Tags)
While normal tags allow a file to have both #rock and #guitar, a file should only have one rating tag at a time.
In your backend API route handling the star click:
```
// When applying a new rating tag (e.g. "4-star")
async function setFileRating(fileId: string, rating: number) {
  // 1. Strip any existing rating tags from the file
  await db.query(`
    DELETE FROM file_tags 
    WHERE file_id = ? AND tag_id IN (
      SELECT id FROM tags WHERE name LIKE '%-star'
    )
  `, [fileId]);

  // 2. Attach the new rating tag if rating > 0
  if (rating > 0) {
    const tagId = await getOrCreateTagId(`${rating}-star`);
    await db.query(`INSERT INTO file_tags (file_id, tag_id) VALUES (?, ?)`, [fileId, tagId]);
  }
}
```