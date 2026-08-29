import { Hono } from 'hono'

const app = new Hono()

// Simple API Hello World endpoint
app.get('/api/hello', (c) => {
    return c.json({
        message: 'WolfDrive backend is live on Bun!',
        status: 'ok',
    })
})

export default {
    port: Number(process.env.PORT) || 3005,
    hostname: process.env.HOST || '0.0.0.0',
    fetch: app.fetch,
}