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

// GET /api/files - Fetch indexed media files
app.get('/api/files', async (c) => {
    const userId = c.get('userId')
    // Comma-separated list, e.g. 'document,pdf'
    const category = c.req.query('category')
    const search = c.req.query('search')
    const limitParam = c.req.query('limit')
    const limit = limitParam ? parseInt(limitParam) : 1000

    let conditions = [eq(mediaFiles.userId, userId)]

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

    const sortColumn = FILE_SORT_COLUMNS[c.req.query('sort') ?? ''] ?? mediaFiles.mtimeMs
    const sortDirection = c.req.query('dir') === 'asc' ? 'asc' : 'desc'

    const files = await db
        .select()
        .from(mediaFiles)
        .where(and(...conditions))
        .orderBy(sortDirection === 'asc' ? asc(sortColumn) : desc(sortColumn))
        .limit(limit)

    return c.json(files)
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

    return c.json(row ?? { cfi: null, farthestCfi: null, fontSize: null })
})

// PUT /api/reading-state/:fileId - Upsert saved EPUB reader state
app.put('/api/reading-state/:fileId', async (c) => {
    const userId = c.get('userId')
    const fileId = c.req.param('fileId')
    const body = await c.req.json<{ cfi?: string | null; farthestCfi?: string | null; fontSize?: number }>()

    const now = new Date().toISOString()
    const updates: { cfi?: string | null; farthestCfi?: string | null; fontSize?: number; updatedAt: string } = { updatedAt: now }
    if (body.cfi !== undefined) updates.cfi = body.cfi
    if (body.farthestCfi !== undefined) updates.farthestCfi = body.farthestCfi
    if (body.fontSize !== undefined) updates.fontSize = body.fontSize

    await db
        .insert(readingState)
        .values({
            id: crypto.randomUUID(),
            userId,
            fileId,
            cfi: body.cfi ?? null,
            farthestCfi: body.farthestCfi ?? null,
            fontSize: body.fontSize ?? 15,
            updatedAt: now,
        })
        .onConflictDoUpdate({
            target: [readingState.userId, readingState.fileId],
            set: updates,
        })

    return c.json({ ok: true })
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