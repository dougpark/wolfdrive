import { readdir, rename, unlink } from 'node:fs/promises'
import { join, extname, basename } from 'node:path'

// Get target folder path from CLI arguments
const targetFolder = process.argv[2]

if (!targetFolder) {
    console.error('❌ Error: Please provide a target folder path.')
    console.log('Usage: bun run src/scripts/cleanup-keys.ts <folder_path>')
    process.exit(1)
}

// Regex to capture the filename body, key suffix, and extension
// Matches: "book1_AAAAR.pdf" -> Group 1: "book1", Group 2: "_AAAAR", Group 3: ".pdf"
const KEY_REGEX = /^(.*)(_[A-Za-z]{5})(\.[^.]+)?$/

async function cleanupKeysInFolder(dirPath: string) {
    console.log(`🔍 Scanning directory: ${dirPath}\n`)

    let renamedCount = 0
    let deletedDuplicatesCount = 0
    let skippedCount = 0

    try {
        const entries = await readdir(dirPath, { withFileTypes: true, recursive: true })

        for (const entry of entries) {
            if (!entry.isFile()) continue

            const filename = entry.name
            const match = filename.match(KEY_REGEX)

            if (!match) {
                skippedCount++
                continue
            }

            const baseNameWithoutKey = match[1] // "book1"
            const extension = match[3] || ''      // ".pdf"
            const cleanedFilename = `${baseNameWithoutKey}${extension}` // "book1.pdf"

            const parentDir = entry.parentPath ?? (entry as any).path ?? dirPath
            const currentPath = join(parentDir, filename)
            const targetPath = join(parentDir, cleanedFilename)

            // Skip if the file already has no key (e.g., matching issue safeguard)
            if (currentPath === targetPath) continue

            const targetFile = Bun.file(targetPath)
            const targetExists = await targetFile.exists()

            if (targetExists) {
                // Target file already exists without the key -> delete this duplicate key file
                console.log(`🗑️  Duplicate found: "${filename}" -> Removing (Kept "${cleanedFilename}")`)
                await unlink(currentPath)
                deletedDuplicatesCount++
            } else {
                // Target file does not exist -> strip key and rename
                console.log(`✏️  Renaming: "${filename}" -> "${cleanedFilename}"`)
                await rename(currentPath, targetPath)
                renamedCount++
            }
        }

        console.log('\n--- Cleanup Summary ---')
        console.log(`✅ Renamed (keys removed): ${renamedCount}`)
        console.log(`🗑️  Deleted (duplicates):   ${deletedDuplicatesCount}`)
        console.log(`⏩ Unmatched / Skipped:    ${skippedCount}`)

    } catch (err) {
        console.error('❌ Error processing folder:', err)
        process.exit(1)
    }
}

cleanupKeysInFolder(targetFolder)

/*
Runs August 31, 2026
bun run src/scripts/cleanup-keys.ts /mnt/world/Production/reference/ebook_library/Classics

*/