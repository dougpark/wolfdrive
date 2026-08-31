import { Hono } from 'hono'
import { serveStatic } from 'hono/bun'
import { db } from './db'
import { mediaDirectories } from './db/schema'
import { eq, and, like } from 'drizzle-orm'
import { scanDirectory, scanAllUserDirectories } from './services/scanner'
import { mediaFiles } from './db/schema'
import { desc } from "drizzle-orm";

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

// 2. Serve Static Frontend Assets (JS, CSS, images from Vite build)
app.use('/*', serveStatic({ root: './dist' }))

// 3. SPA Fallback Routing
// If a user visits /swatches directly in their browser, Hono serves index.html
// so Vue Router can load the correct view on the client side.
app.get('*', serveStatic({ path: './dist/index.html' }))


// GET /api/directories - Fetch user's registered paths
app.get('/api/directories', async (c) => {
    const userId = c.get('userId')
    const dirs = await db.select().from(mediaDirectories).where(eq(mediaDirectories.userId, userId))
    return c.json(dirs)
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

export default {
    port: Number(process.env.PORT) || 3005,
    hostname: process.env.HOST || '0.0.0.0',
    fetch: app.fetch,
}