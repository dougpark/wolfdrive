import { readdir } from 'node:fs/promises'
import { join, extname, relative } from 'node:path'
import { db } from '../db'
import { mediaDirectories, mediaFiles } from '../db/schema'
import { eq, and } from 'drizzle-orm'

function getMediaCategory(mimeType: string, ext: string): string {
    if (mimeType.startsWith('image/')) return 'image'
    if (mimeType.startsWith('video/')) return 'video'
    if (mimeType.startsWith('audio/')) return 'audio'
    if (mimeType.includes('pdf') || ext === 'pdf') return 'pdf' // Isolated PDF category
    if (mimeType.includes('epub') || ext === 'epub') return 'epub' // Isolated EPUB category
    if (['mobi', 'txt', 'md', 'doc', 'docx'].includes(ext)) return 'document'
    return 'other'
}

export async function scanDirectory(directoryId: string): Promise<{ indexed: number; skipped: number }> {
    const [dir] = await db.select().from(mediaDirectories).where(eq(mediaDirectories.id, directoryId))
    if (!dir || !dir.enabled) return { indexed: 0, skipped: 0 }

    let indexedCount = 0
    let skippedCount = 0

    try {
        // Fast native recursive directory traversal
        const entries = await readdir(dir.path, { recursive: true, withFileTypes: true })

        for (const entry of entries) {
            if (!entry.isFile()) continue

            // Ignore hidden dotfiles and system files (.DS_Store, .git, etc.)
            if (entry.name.startsWith('.')) continue

            const parent = entry.parentPath ?? (entry as { path?: string }).path ?? dir.path
            const absolutePath = join(parent, entry.name)

            const relPath = relative(dir.path, absolutePath)
            const file = Bun.file(absolutePath)

            const exists = await file.exists()
            if (!exists) continue

            const size = file.size
            const mtime = file.lastModified
            const mimeType = file.type || 'application/octet-stream'
            const ext = extname(entry.name).toLowerCase().replace('.', '')
            const category = getMediaCategory(mimeType, ext)

            // Check if file already indexed with exact mtime & size
            const [existing] = await db
                .select()
                .from(mediaFiles)
                .where(eq(mediaFiles.path, absolutePath))

            if (existing && existing.mtimeMs === mtime && existing.sizeBytes === size) {
                skippedCount++
                continue
            }

            const record = {
                id: `file_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`,
                directoryId: dir.id,
                userId: dir.userId,
                path: absolutePath,
                relativePath: relPath,
                filename: entry.name,
                extension: ext,
                mimeType,
                mediaCategory: category,
                sizeBytes: size,
                mtimeMs: mtime,
                indexedAt: new Date().toISOString(),
            }

            await db
                .insert(mediaFiles)
                .values(record)
                .onConflictDoUpdate({
                    target: mediaFiles.path,
                    set: {
                        sizeBytes: size,
                        mtimeMs: mtime,
                        mimeType,
                        mediaCategory: category,
                        indexedAt: new Date().toISOString(),
                    },
                })

            indexedCount++
        }

        // Update last scanned timestamp on directory
        await db
            .update(mediaDirectories)
            .set({ lastScannedAt: new Date().toISOString() })
            .where(eq(mediaDirectories.id, dir.id))

    } catch (err) {
        console.error(`[Scanner Error] Failed scanning path: ${dir.path}`, err)
        throw err
    }

    return { indexed: indexedCount, skipped: skippedCount }
}

export async function scanAllUserDirectories(userId: string) {
    const dirs = await db.select().from(mediaDirectories).where(eq(mediaDirectories.userId, userId))
    let totalIndexed = 0
    let totalSkipped = 0

    for (const dir of dirs) {
        const result = await scanDirectory(dir.id)
        totalIndexed += result.indexed
        totalSkipped += result.skipped
    }

    return { totalIndexed, totalSkipped }
}