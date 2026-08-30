import { Hono } from 'hono'
import { serveStatic } from 'hono/bun'

const app = new Hono()

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

export default {
    port: Number(process.env.PORT) || 3005,
    hostname: process.env.HOST || '0.0.0.0',
    fetch: app.fetch,
}