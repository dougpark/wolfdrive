import { Hono } from 'hono'
import { serveStatic } from 'hono/bun'
import { db } from './db'
import { mediaDirectories } from './db/schema'
import { eq, and, like, or, sql, inArray, asc } from 'drizzle-orm'
import type { AnySQLiteColumn } from 'drizzle-orm/sqlite-core'
import { scanDirectory, scanAllUserDirectories } from './services/scanner'
import { mediaFiles } from './db/schema'
import { desc } from "drizzle-orm";
import { appSettings } from './db/schema'
import { readingState } from './db/schema'
import { tags, fileTags } from './db/schema'
import {
    CUSTOM_ONLY_LIBRARY_IDS,
    LIBRARY_CATEGORY_MIME_MAP,
    SELECTABLE_LIBRARY_IDS,
} from './config/libraryCategoryData'

const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL
    ? process.env.OLLAMA_BASE_URL.replace(/\/+$/, '')
    : 'http://127.0.0.1:11434';

const OLLAMA_URL = `${OLLAMA_BASE_URL}/api/generate`;
// const OLLAMA_URL = process.env.OLLAMA_BASE_URL ? `${process.env.OLLAMA_BASE_URL}/api/generate` : 'http://127.0.0.1:11434/api/generate'
const MODEL_NAME = 'gemma4:e4b'
const AI_ATTACHMENT_MAX_BYTES = 200_000
const AI_TEXT_EXTENSIONS = new Set(['md', 'markdown', 'txt', 'json', 'csv', 'log', 'xml', 'yaml', 'yml'])

/** Whitelist of sortable columns for GET /api/files. */
const FILE_SORT_COLUMNS: Record<string, AnySQLiteColumn> = {
    name: mediaFiles.filename,
    type: mediaFiles.extension,
    modified: mediaFiles.mtimeMs,
    size: mediaFiles.sizeBytes,
}

function canAttachFileContent(file: typeof mediaFiles.$inferSelect) {
    return file.mimeType?.startsWith('text/') || AI_TEXT_EXTENSIONS.has(file.extension.toLowerCase())
}

/** Headers only accept ISO-8859-1, so non-ASCII names need the RFC 5987 `filename*` form. */
function contentDisposition(filename: string, disposition: 'inline' | 'attachment' = 'inline') {
    const ascii = filename.replace(/[^\x20-\x7e]/g, '_').replaceAll('"', '')
    return `${disposition}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`
}

async function buildFileAttachment(fileId: string, userId: string) {
    const [file] = await db
        .select()
        .from(mediaFiles)
        .where(and(eq(mediaFiles.id, fileId), eq(mediaFiles.userId, userId)))
        .limit(1)

    if (!file) return ''

    const diskFile = Bun.file(file.path)
    const exists = await diskFile.exists()
    const header = [
        'Attached file metadata:',
        `Filename: ${file.filename}`,
        `Relative path: ${file.relativePath}`,
        `MIME type: ${file.mimeType || 'unknown'}`,
        `Size: ${file.sizeBytes} bytes`,
    ].join('\n')

    if (!exists) return `${header}\n\nFile contents are unavailable because the file is no longer on disk.`
    if (!canAttachFileContent(file)) {
        return `${header}\n\nFile contents were not attached because this file type is not text-readable yet.`
    }
    if (file.sizeBytes > AI_ATTACHMENT_MAX_BYTES) {
        return `${header}\n\nFile contents were not attached because the file is larger than ${AI_ATTACHMENT_MAX_BYTES} bytes.`
    }

    const content = await diskFile.text()
    return `${header}\n\nAttached file contents:\n\n${content}`
}

// Define custom environment variables type for context storage
type Env = {
    Variables: {
        userId: string
    }
}

// Instantiate Hono with the custom Env type
const app = new Hono<Env>()

// Middleware inside Hono
app.use('/api/*', async (c, next) => {
    // Hardcoded default user context for now
    c.set('userId', 'usr_default')
    await next()
})

// Simple API Hello World endpoint
app.get('/api/hello', (c) => {
    return c.json({
        message: 'WolfDrive backend is live on Bun!',
        status: 'ok',
    })
})

// POST /api/ai/chat - Send a prompt to the local Ollama model
app.post('/api/ai/chat', async (c) => {
    const userId = c.get('userId')
    const { message, fileId } = await c.req.json<{ message?: string; fileId?: string }>()
    const trimmedMessage = message?.trim()

    if (!trimmedMessage) {
        return c.json({ error: 'Message is required' }, 400)
    }

    const attachment = fileId ? await buildFileAttachment(fileId, userId) : ''
    const prompt = [
        'You are WolfDrive local AI, a helpful assistant for a personal media library.',
        'Answer clearly and concisely. If an attached file is provided, use it as context for the user request.',
        attachment,
        `User request:\n${trimmedMessage}`,
    ].filter(Boolean).join('\n\n')

    try {
        const response = await fetch(OLLAMA_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: MODEL_NAME,
                prompt,
                stream: false,
                options: {
                    temperature: 0.2,
                },
            }),
        })

        if (!response.ok) {
            return c.json({ error: `Ollama request failed: ${response.status}` }, 502)
        }

        const data = await response.json() as { response?: string }
        return c.json({ response: data.response ?? '' })
    } catch (error) {
        console.error('Ollama request failed:', error)
        return c.json({ error: 'Unable to reach local AI service' }, 502)
    }
})

// Add future backend API endpoints here
// app.get('/api/files', ...)

// GET /api/directories - Fetch user directories with aggregated stats
app.get('/api/directories', async (c) => {
    const userId = c.get('userId')

    // 1. Fetch directories
    const dirs = await db
        .select()
        .from(mediaDirectories)
        .where(eq(mediaDirectories.userId, userId))

    // 2. Fetch category file counts grouped by directoryId and mediaCategory
    const stats = await db
        .select({
            directoryId: mediaFiles.directoryId,
            category: mediaFiles.mediaCategory,
            count: sql<number>`count(*)`,
        })
        .from(mediaFiles)
        .where(eq(mediaFiles.userId, userId))
        .groupBy(mediaFiles.directoryId, mediaFiles.mediaCategory)

    // 3. Map aggregated stats into directory objects
    const result = dirs.map((dir) => {
        const dirStats = stats.filter((s) => s.directoryId === dir.id)
        const breakdown = dirStats.reduce((acc, row) => {
            acc[row.category] = Number(row.count)
            return acc
        }, {} as Record<string, number>)

        const totalFiles = Object.values(breakdown).reduce((a, b) => a + b, 0)

        return {
            ...dir,
            totalFiles,
            breakdown,
        }
    })

    return c.json(result)
})

// POST /api/directories - Register a new directory
app.post('/api/directories', async (c) => {
    const userId = c.get('userId')
    const { path, label } = await c.req.json<{ path: string; label?: string }>()

    if (!path || !path.trim()) {
        return c.json({ error: 'Directory path is required' }, 400)
    }

    const newDir = {
        id: `dir_${crypto.randomUUID().slice(0, 8)}`,
        userId,
        path: path.trim(),
        label: label?.trim() || null,
        enabled: true,
    }

    await db.insert(mediaDirectories).values(newDir)
    return c.json(newDir, 201)
})

// DELETE /api/directories/:id - Remove a directory
app.delete('/api/directories/:id', async (c) => {
    const userId = c.get('userId')
    const id = c.req.param('id')

    await db.delete(mediaDirectories).where(
        and(eq(mediaDirectories.id, id), eq(mediaDirectories.userId, userId))
    )

    return c.json({ success: true })
})

// POST /api/scan - Scan all user directories
app.post('/api/scan', async (c) => {
    const userId = c.get('userId')
    const stats = await scanAllUserDirectories(userId)
    return c.json({ success: true, ...stats })
})

// POST /api/scan/:id - Scan a specific directory
app.post('/api/scan/:id', async (c) => {
    const dirId = c.req.param('id')
    const stats = await scanDirectory(dirId)
    return c.json({ success: true, ...stats })
})

/** Normalizes a tag name into a case/whitespace-insensitive lookup key. */
function slugifyTag(name: string): string {
    return name.trim().toLowerCase().replace(/\s+/g, ' ')
}

/**
 * Batch-fetches tags for a page of file ids and groups them by file id. Always called
 * *after* the primary query has paginated, never joined before LIMIT, so a to-many
 * relation never inflates the row count of a filtered/sorted/limited result set.
 */
async function attachTags(fileIds: string[]): Promise<Map<string, { id: string; name: string; color: string | null }[]>> {
    const byFile = new Map<string, { id: string; name: string; color: string | null }[]>()
    if (fileIds.length === 0) return byFile

    const rows = await db
        .select({
            fileId: fileTags.fileId,
            id: tags.id,
            name: tags.name,
            color: tags.color,
        })
        .from(fileTags)
        .innerJoin(tags, eq(fileTags.tagId, tags.id))
        .where(inArray(fileTags.fileId, fileIds))

    for (const row of rows) {
        const list = byFile.get(row.fileId) ?? []
        list.push({ id: row.id, name: row.name, color: row.color })
        byFile.set(row.fileId, list)
    }
    return byFile
}

// GET /api/files - Fetch indexed media files
app.get('/api/files', async (c) => {
    const userId = c.get('userId')
    // Comma-separated list, e.g. 'document,pdf'
    const category = c.req.query('category')
    // Library id, e.g. 'books' — matches mime-derived defaults OR user-assigned tags
    const library = c.req.query('library')?.trim()
    const search = c.req.query('search')
    const limitParam = c.req.query('limit')
    const limit = limitParam ? parseInt(limitParam) : 1000
    // Comma-separated tag ids to filter by, e.g. 'tag_abc,tag_def'
    const requestedTagIds = (c.req.query('tags') ?? '')
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean)
    // 'all' (AND, default) requires every tag; 'any' (OR) requires at least one
    const tagMode = c.req.query('tagMode') === 'any' ? 'any' : 'all'

    let conditions = [eq(mediaFiles.userId, userId)]

    if (library && library !== 'files') {
        const mimeCategories = LIBRARY_CATEGORY_MIME_MAP[library as keyof typeof LIBRARY_CATEGORY_MIME_MAP]
        if (!mimeCategories) {
            return c.json({ error: `Unknown library category: ${library}` }, 400)
        }

        // User tags live in the custom_categories JSON array; json_each expands them.
        const customMatch = sql`EXISTS (SELECT 1 FROM json_each(${mediaFiles.customCategories}) WHERE json_each.value = ${library})`

        if (CUSTOM_ONLY_LIBRARY_IDS.has(library) || mimeCategories.length === 0) {
            conditions.push(customMatch)
        } else if (mimeCategories.length === 1) {
            conditions.push(or(eq(mediaFiles.mediaCategory, mimeCategories[0]!), customMatch)!)
        } else {
            conditions.push(or(inArray(mediaFiles.mediaCategory, mimeCategories), customMatch)!)
        }
    }

    const requestedCategories = (category ?? '')
        .split(',')
        .map((value) => value.trim())
        .filter((value) => value.length > 0 && value !== 'all')

    if (requestedCategories.length === 1) {
        conditions.push(eq(mediaFiles.mediaCategory, requestedCategories[0]!))
    } else if (requestedCategories.length > 1) {
        conditions.push(inArray(mediaFiles.mediaCategory, requestedCategories))
    }

    const trimmedSearch = search?.trim()
    if (trimmedSearch) {
        const searchPattern = `%${trimmedSearch}%`
        const searchCondition = or(
            like(mediaFiles.filename, searchPattern),
            like(mediaFiles.relativePath, searchPattern),
            like(mediaFiles.path, searchPattern),
        )

        if (searchCondition) conditions.push(searchCondition)
    }

    if (requestedTagIds.length > 0) {
        if (tagMode === 'any') {
            // Single EXISTS against the indexed tag_id column covers any-of-N tags.
            conditions.push(
                sql`EXISTS (SELECT 1 FROM ${fileTags} WHERE ${fileTags.fileId} = ${mediaFiles.id} AND ${fileTags.tagId} IN ${requestedTagIds})`,
            )
        } else {
            // One EXISTS per tag so every tag must independently match (AND semantics).
            for (const tagId of requestedTagIds) {
                conditions.push(
                    sql`EXISTS (SELECT 1 FROM ${fileTags} WHERE ${fileTags.fileId} = ${mediaFiles.id} AND ${fileTags.tagId} = ${tagId})`,
                )
            }
        }
    }

    const sortColumn = FILE_SORT_COLUMNS[c.req.query('sort') ?? ''] ?? mediaFiles.mtimeMs
    const sortDirection = c.req.query('dir') === 'asc' ? 'asc' : 'desc'

    const files = await db
        .select()
        .from(mediaFiles)
        .where(and(...conditions))
        .orderBy(sortDirection === 'asc' ? asc(sortColumn) : desc(sortColumn))
        .limit(limit)

    const tagsByFile = await attachTags(files.map((f) => f.id))
    const filesWithTags = files.map((f) => ({ ...f, tags: tagsByFile.get(f.id) ?? [] }))

    return c.json(filesWithTags)
})

// GET /api/files/:id - Fetch metadata for a single indexed file
app.get('/api/files/:id', async (c) => {
    const userId = c.get('userId')
    const id = c.req.param('id')

    const [file] = await db
        .select()
        .from(mediaFiles)
        .where(and(eq(mediaFiles.id, id), eq(mediaFiles.userId, userId)))
        .limit(1)

    if (!file) {
        return c.json({ error: 'File not found' }, 404)
    }

    return c.json(file)
})

// PUT /api/files/:id/categories - Replace the user-assigned library categories for a file
app.put('/api/files/:id/categories', async (c) => {
    const userId = c.get('userId')
    const id = c.req.param('id')
    const body = await c.req.json<{ categories?: unknown }>()

    if (!Array.isArray(body.categories)) {
        return c.json({ error: 'categories must be an array of library ids' }, 400)
    }

    // Drop anything that is not a known selectable library id
    const allowed = new Set<string>(SELECTABLE_LIBRARY_IDS)
    const categories = [
        ...new Set(
            body.categories.filter((value): value is string => typeof value === 'string' && allowed.has(value)),
        ),
    ]

    const [updated] = await db
        .update(mediaFiles)
        .set({ customCategories: categories.length ? categories : null })
        .where(and(eq(mediaFiles.id, id), eq(mediaFiles.userId, userId)))
        .returning()

    if (!updated) {
        return c.json({ error: 'File not found' }, 404)
    }

    return c.json(updated)
})

// GET /api/files/categories/usage?ids=a,b,c - Per-category usage counts across a batch of files
app.get('/api/files/categories/usage', async (c) => {
    const userId = c.get('userId')
    const fileIds = (c.req.query('ids') ?? '')
        .split(',')
        .map((v) => v.trim())
        .filter(Boolean)

    if (fileIds.length === 0) {
        return c.json({})
    }

    const rows = await db
        .select({ customCategories: mediaFiles.customCategories })
        .from(mediaFiles)
        .where(and(eq(mediaFiles.userId, userId), inArray(mediaFiles.id, fileIds)))

    const counts: Record<string, number> = {}
    for (const row of rows) {
        for (const categoryId of row.customCategories ?? []) {
            counts[categoryId] = (counts[categoryId] ?? 0) + 1
        }
    }

    return c.json(counts)
})

// POST /api/files/categories/add - Add one library category to every file in a batch
app.post('/api/files/categories/add', async (c) => {
    const userId = c.get('userId')
    const body = await c.req.json<{ fileIds?: unknown; categoryId?: unknown }>()

    const categoryId = typeof body.categoryId === 'string' ? body.categoryId : ''
    const fileIds = Array.isArray(body.fileIds) ? body.fileIds.filter((v): v is string => typeof v === 'string') : []
    if (!categoryId || fileIds.length === 0 || !new Set<string>(SELECTABLE_LIBRARY_IDS).has(categoryId)) {
        return c.json({ error: 'categoryId and fileIds are required' }, 400)
    }

    const rows = await db
        .select({ id: mediaFiles.id, customCategories: mediaFiles.customCategories })
        .from(mediaFiles)
        .where(and(eq(mediaFiles.userId, userId), inArray(mediaFiles.id, fileIds)))

    db.transaction((tx) => {
        for (const row of rows) {
            if (row.customCategories?.includes(categoryId)) continue
            const next = [...(row.customCategories ?? []), categoryId]
            tx.update(mediaFiles).set({ customCategories: next }).where(eq(mediaFiles.id, row.id)).run()
        }
    })

    return c.json({ success: true, fileCount: rows.length })
})

// POST /api/files/categories/remove - Remove one library category from every file in a batch
app.post('/api/files/categories/remove', async (c) => {
    const userId = c.get('userId')
    const body = await c.req.json<{ fileIds?: unknown; categoryId?: unknown }>()

    const categoryId = typeof body.categoryId === 'string' ? body.categoryId : ''
    const fileIds = Array.isArray(body.fileIds) ? body.fileIds.filter((v): v is string => typeof v === 'string') : []
    if (!categoryId || fileIds.length === 0) {
        return c.json({ error: 'categoryId and fileIds are required' }, 400)
    }

    const rows = await db
        .select({ id: mediaFiles.id, customCategories: mediaFiles.customCategories })
        .from(mediaFiles)
        .where(and(eq(mediaFiles.userId, userId), inArray(mediaFiles.id, fileIds)))

    db.transaction((tx) => {
        for (const row of rows) {
            if (!row.customCategories?.includes(categoryId)) continue
            const next = row.customCategories.filter((c) => c !== categoryId)
            tx.update(mediaFiles).set({ customCategories: next.length ? next : null }).where(eq(mediaFiles.id, row.id)).run()
        }
    })

    return c.json({ success: true, fileCount: rows.length })
})

// GET /api/tags - List all tags for the user with usage counts (drives the tag manager + autocomplete)
app.get('/api/tags', async (c) => {
    const userId = c.get('userId')

    const rows = await db
        .select({
            id: tags.id,
            name: tags.name,
            color: tags.color,
            fileCount: sql<number>`count(${fileTags.fileId})`,
        })
        .from(tags)
        .leftJoin(fileTags, eq(fileTags.tagId, tags.id))
        .where(eq(tags.userId, userId))
        .groupBy(tags.id)
        .orderBy(asc(tags.name))

    return c.json(rows.map((row) => ({ ...row, fileCount: Number(row.fileCount) })))
})

// POST /api/tags - Find-or-create a tag by name (idempotent, used by inline tag creation in the picker)
app.post('/api/tags', async (c) => {
    const userId = c.get('userId')
    const body = await c.req.json<{ name?: unknown }>()

    const name = typeof body.name === 'string' ? body.name.trim() : ''
    if (!name) {
        return c.json({ error: 'name is required' }, 400)
    }
    const slug = slugifyTag(name)

    const [existing] = await db
        .select()
        .from(tags)
        .where(and(eq(tags.userId, userId), eq(tags.slug, slug)))
        .limit(1)
    if (existing) {
        return c.json(existing)
    }

    const [created] = await db
        .insert(tags)
        .values({ id: `tag_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`, userId, name, slug })
        .returning()

    return c.json(created, 201)
})

// PATCH /api/tags/:id - Rename a tag
app.patch('/api/tags/:id', async (c) => {
    const userId = c.get('userId')
    const id = c.req.param('id')
    const body = await c.req.json<{ name?: unknown }>()

    const name = typeof body.name === 'string' ? body.name.trim() : ''
    if (!name) {
        return c.json({ error: 'name is required' }, 400)
    }
    const slug = slugifyTag(name)

    const [conflict] = await db
        .select()
        .from(tags)
        .where(and(eq(tags.userId, userId), eq(tags.slug, slug)))
        .limit(1)
    if (conflict && conflict.id !== id) {
        return c.json({ error: 'A tag with that name already exists' }, 409)
    }

    const [updated] = await db
        .update(tags)
        .set({ name, slug })
        .where(and(eq(tags.id, id), eq(tags.userId, userId)))
        .returning()

    if (!updated) {
        return c.json({ error: 'Tag not found' }, 404)
    }
    return c.json(updated)
})

// DELETE /api/tags/:id - Delete a tag (cascades file_tags rows)
app.delete('/api/tags/:id', async (c) => {
    const userId = c.get('userId')
    const id = c.req.param('id')

    const [deleted] = await db
        .delete(tags)
        .where(and(eq(tags.id, id), eq(tags.userId, userId)))
        .returning()

    if (!deleted) {
        return c.json({ error: 'Tag not found' }, 404)
    }
    return c.json({ success: true })
})

// GET /api/files/:id/tags - List tags assigned to a file
app.get('/api/files/:id/tags', async (c) => {
    const userId = c.get('userId')
    const id = c.req.param('id')

    const [file] = await db
        .select({ id: mediaFiles.id })
        .from(mediaFiles)
        .where(and(eq(mediaFiles.id, id), eq(mediaFiles.userId, userId)))
        .limit(1)
    if (!file) {
        return c.json({ error: 'File not found' }, 404)
    }

    const rows = await db
        .select({ id: tags.id, name: tags.name, color: tags.color })
        .from(fileTags)
        .innerJoin(tags, eq(fileTags.tagId, tags.id))
        .where(eq(fileTags.fileId, id))
        .orderBy(asc(tags.name))

    return c.json(rows)
})

// PUT /api/files/:id/tags - Replace the full set of tags assigned to a file
app.put('/api/files/:id/tags', async (c) => {
    const userId = c.get('userId')
    const id = c.req.param('id')
    const body = await c.req.json<{ tagIds?: unknown }>()

    if (!Array.isArray(body.tagIds)) {
        return c.json({ error: 'tagIds must be an array of tag ids' }, 400)
    }
    const requestedIds = [...new Set(body.tagIds.filter((v): v is string => typeof v === 'string'))]

    const [file] = await db
        .select({ id: mediaFiles.id })
        .from(mediaFiles)
        .where(and(eq(mediaFiles.id, id), eq(mediaFiles.userId, userId)))
        .limit(1)
    if (!file) {
        return c.json({ error: 'File not found' }, 404)
    }

    // Only assign tags that belong to this user.
    const ownedTags = requestedIds.length
        ? await db.select({ id: tags.id }).from(tags).where(and(eq(tags.userId, userId), inArray(tags.id, requestedIds)))
        : []
    const ownedIds = ownedTags.map((t) => t.id)

    db.transaction((tx) => {
        tx.delete(fileTags).where(eq(fileTags.fileId, id)).run()
        for (const tagId of ownedIds) {
            tx.insert(fileTags).values({ fileId: id, tagId }).run()
        }
    })

    const rows = await db
        .select({ id: tags.id, name: tags.name, color: tags.color })
        .from(fileTags)
        .innerJoin(tags, eq(fileTags.tagId, tags.id))
        .where(eq(fileTags.fileId, id))
        .orderBy(asc(tags.name))

    return c.json(rows)
})

// GET /api/tags/usage?ids=a,b,c - Per-tag usage counts across a batch of files (drives the tri-state batch tag panel)
app.get('/api/tags/usage', async (c) => {
    const userId = c.get('userId')
    const fileIds = (c.req.query('ids') ?? '')
        .split(',')
        .map((v) => v.trim())
        .filter(Boolean)

    if (fileIds.length === 0) {
        return c.json([])
    }

    const rows = await db
        .select({
            id: tags.id,
            name: tags.name,
            color: tags.color,
            fileCount: sql<number>`count(distinct ${fileTags.fileId})`,
        })
        .from(fileTags)
        .innerJoin(tags, eq(fileTags.tagId, tags.id))
        .innerJoin(mediaFiles, eq(fileTags.fileId, mediaFiles.id))
        .where(and(eq(mediaFiles.userId, userId), inArray(fileTags.fileId, fileIds)))
        .groupBy(tags.id)
        .orderBy(asc(tags.name))

    return c.json(rows.map((row) => ({ ...row, fileCount: Number(row.fileCount) })))
})

// POST /api/files/tags/add - Add one tag to every file in a batch (idempotent, skips files that already have it)
app.post('/api/files/tags/add', async (c) => {
    const userId = c.get('userId')
    const body = await c.req.json<{ fileIds?: unknown; tagId?: unknown }>()

    const tagId = typeof body.tagId === 'string' ? body.tagId : ''
    const fileIds = Array.isArray(body.fileIds) ? body.fileIds.filter((v): v is string => typeof v === 'string') : []
    if (!tagId || fileIds.length === 0) {
        return c.json({ error: 'tagId and fileIds are required' }, 400)
    }

    const [tag] = await db.select({ id: tags.id }).from(tags).where(and(eq(tags.id, tagId), eq(tags.userId, userId))).limit(1)
    if (!tag) {
        return c.json({ error: 'Tag not found' }, 404)
    }

    const ownedFiles = await db
        .select({ id: mediaFiles.id })
        .from(mediaFiles)
        .where(and(eq(mediaFiles.userId, userId), inArray(mediaFiles.id, fileIds)))
    const ownedIds = ownedFiles.map((f) => f.id)

    if (ownedIds.length) {
        db.insert(fileTags).values(ownedIds.map((fileId) => ({ fileId, tagId }))).onConflictDoNothing().run()
    }

    return c.json({ success: true, fileCount: ownedIds.length })
})

// POST /api/files/tags/remove - Remove one tag from every file in a batch
app.post('/api/files/tags/remove', async (c) => {
    const userId = c.get('userId')
    const body = await c.req.json<{ fileIds?: unknown; tagId?: unknown }>()

    const tagId = typeof body.tagId === 'string' ? body.tagId : ''
    const fileIds = Array.isArray(body.fileIds) ? body.fileIds.filter((v): v is string => typeof v === 'string') : []
    if (!tagId || fileIds.length === 0) {
        return c.json({ error: 'tagId and fileIds are required' }, 400)
    }

    const [tag] = await db.select({ id: tags.id }).from(tags).where(and(eq(tags.id, tagId), eq(tags.userId, userId))).limit(1)
    if (!tag) {
        return c.json({ error: 'Tag not found' }, 404)
    }

    const ownedFiles = await db
        .select({ id: mediaFiles.id })
        .from(mediaFiles)
        .where(and(eq(mediaFiles.userId, userId), inArray(mediaFiles.id, fileIds)))
    const ownedIds = ownedFiles.map((f) => f.id)

    if (ownedIds.length) {
        db.delete(fileTags).where(and(eq(fileTags.tagId, tagId), inArray(fileTags.fileId, ownedIds))).run()
    }

    return c.json({ success: true, fileCount: ownedIds.length })
})

// GET /api/stream/:id - Stream an indexed file for browser previews
app.get('/api/stream/:id', async (c) => {
    const userId = c.get('userId')
    const id = c.req.param('id')
    const [file] = await db
        .select()
        .from(mediaFiles)
        .where(and(eq(mediaFiles.id, id), eq(mediaFiles.userId, userId)))
        .limit(1)

    if (!file) {
        return c.json({ error: 'File not found' }, 404)
    }

    const diskFile = Bun.file(file.path)
    if (!(await diskFile.exists())) {
        return c.json({ error: 'File is no longer available' }, 404)
    }

    return new Response(diskFile, {
        headers: {
            'Content-Type': file.mimeType || 'application/octet-stream',
            'Content-Disposition': contentDisposition(file.filename),
        },
    })
})

// GET /api/stats - Fetch count breakdown across categories
app.get('/api/stats', async (c) => {
    const userId = c.get('userId')

    const stats = await db
        .select({
            category: mediaFiles.mediaCategory,
            count: sql<number>`count(*)`,
        })
        .from(mediaFiles)
        .where(eq(mediaFiles.userId, userId))
        .groupBy(mediaFiles.mediaCategory)

    // Returns: { image: 14200, video: 1200, audio: 4800, pdf: 312, ... }
    const counts = stats.reduce((acc, row) => {
        acc[row.category] = Number(row.count)
        return acc
    }, {} as Record<string, number>)

    return c.json(counts)
})

// GET /api/reading-state/:fileId - Fetch saved EPUB reader state (CFI position + font size)
app.get('/api/reading-state/:fileId', async (c) => {
    const userId = c.get('userId')
    const fileId = c.req.param('fileId')

    const [row] = await db
        .select()
        .from(readingState)
        .where(and(eq(readingState.userId, userId), eq(readingState.fileId, fileId)))
        .limit(1)

    return c.json(row ?? { cfi: null, farthestCfi: null, fontSize: null, totalChars: null })
})

// PUT /api/reading-state/:fileId - Upsert saved EPUB reader state
app.put('/api/reading-state/:fileId', async (c) => {
    const userId = c.get('userId')
    const fileId = c.req.param('fileId')
    const body = await c.req.json<{ cfi?: string | null; farthestCfi?: string | null; fontSize?: number; totalChars?: number; percentRead?: number }>()

    const now = new Date().toISOString()
    const updates: { cfi?: string | null; farthestCfi?: string | null; fontSize?: number; totalChars?: number; percentRead?: number; updatedAt: string } = { updatedAt: now }
    if (body.cfi !== undefined) updates.cfi = body.cfi
    if (body.farthestCfi !== undefined) updates.farthestCfi = body.farthestCfi
    if (body.fontSize !== undefined) updates.fontSize = body.fontSize
    if (body.totalChars !== undefined) updates.totalChars = body.totalChars
    if (body.percentRead !== undefined) updates.percentRead = body.percentRead

    await db
        .insert(readingState)
        .values({
            id: crypto.randomUUID(),
            userId,
            fileId,
            cfi: body.cfi ?? null,
            farthestCfi: body.farthestCfi ?? null,
            fontSize: body.fontSize ?? 15,
            totalChars: body.totalChars ?? null,
            percentRead: body.percentRead ?? null,
            updatedAt: now,
        })
        .onConflictDoUpdate({
            target: [readingState.userId, readingState.fileId],
            set: updates,
        })

    return c.json({ ok: true })
})

// GET /api/reading-state?ids=a,b,c - Batch progress lookup for library list views
app.get('/api/reading-state', async (c) => {
    const userId = c.get('userId')
    const ids = (c.req.query('ids') ?? '').split(',').filter(Boolean).slice(0, 1000)
    if (ids.length === 0) return c.json([])

    const rows = await db
        .select({ fileId: readingState.fileId, percentRead: readingState.percentRead })
        .from(readingState)
        .where(and(eq(readingState.userId, userId), inArray(readingState.fileId, ids)))

    return c.json(rows)
})

// App Settings API Endpoints

// Default ignore rules
const DEFAULT_IGNORES = [
    'node_modules/',
    '.git/',
    '.DS_Store',
    '*.tmp',
    '*.log',
    '$RECYCLE.BIN/',
    'System Volume Information/'
]

// GET /api/settings/ignore - Fetch ignore list
app.get('/api/settings/ignore', async (c) => {
    const [row] = await db.select().from(appSettings).where(eq(appSettings.key, 'ignore_patterns'))

    if (!row) {
        return c.json(DEFAULT_IGNORES)
    }

    try {
        return c.json(JSON.parse(row.value))
    } catch {
        return c.json(DEFAULT_IGNORES)
    }
})

// POST /api/settings/ignore - Update ignore list
app.post('/api/settings/ignore', async (c) => {
    const { patterns } = await c.req.json<{ patterns: string[] }>()

    await db
        .insert(appSettings)
        .values({
            key: 'ignore_patterns',
            value: JSON.stringify(patterns),
            updatedAt: new Date().toISOString(),
        })
        .onConflictDoUpdate({
            target: appSettings.key,
            set: {
                value: JSON.stringify(patterns),
                updatedAt: new Date().toISOString(),
            },
        })

    return c.json({ success: true, patterns })
})

// Serve Static Frontend Assets (JS, CSS, images from Vite build)
app.use('/*', serveStatic({ root: './dist' }))

// SPA fallback: Vue Router resolves routes after serving the application shell.
app.get('*', serveStatic({ path: './dist/index.html' }))

export default {
    port: Number(process.env.PORT) || 3005,
    hostname: process.env.HOST || '0.0.0.0',
    fetch: app.fetch,
}