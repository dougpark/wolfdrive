import { Hono } from 'hono'
import { serveStatic } from 'hono/bun'
import { db } from './db'
import { mediaDirectories } from './db/schema'
import { eq, and, like, sql } from 'drizzle-orm'
import { scanDirectory, scanAllUserDirectories } from './services/scanner'
import { mediaFiles } from './db/schema'
import { desc } from "drizzle-orm";
import { appSettings } from './db/schema'

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
    const category = c.req.query('category') // 'image' | 'video' | 'audio' | 'document'
    const search = c.req.query('search')
    const limitParam = c.req.query('limit')
    const limit = limitParam ? parseInt(limitParam) : 10000

    let conditions = [eq(mediaFiles.userId, userId)]

    if (category && category !== 'all') {
        conditions.push(eq(mediaFiles.mediaCategory, category))
    }

    if (search) {
        conditions.push(like(mediaFiles.filename, `%${search}%`))
    }

    const files = await db
        .select()
        .from(mediaFiles)
        .where(and(...conditions))
        .orderBy(desc(mediaFiles.mtimeMs))
        .limit(limit)

    return c.json(files)
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
            'Content-Disposition': `inline; filename="${file.filename.replaceAll('"', '')}"`,
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