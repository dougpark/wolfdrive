import { db } from '../db'
import { mediaFiles } from '../db/schema'

console.log('🧹 Clearing all records from media_files table...')

try {
    const result = await db.delete(mediaFiles)
    console.log('✅ Successfully cleared the media_files table.')
    process.exit(0)
} catch (err) {
    console.error('❌ Failed to clear media_files:', err)
    process.exit(1)
}

// Run with `bun run src/scripts/clear-files.ts` to clear the media_files table.