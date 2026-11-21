import { Hono } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { and, asc, desc, eq, sql } from 'drizzle-orm'
import { statusEvents, statusJobs, statusRuns } from '../db/schema'
import type { DashboardSummary, StatusJobPage } from '../types/status'
import { hashToken, ingestStatusEvent, newReportingToken, statusRunDetail, summarizeStatusJob, sweepStatusRetention, tokenMatches } from './statusServer'
import type { StatusDatabase } from './statusServer'
import { MAX_EVENT_BYTES, StatusError, validateEvent, validateJobConfig, validateJobId } from './statusValidation'

interface StatusOptions {
    adminToken?: string
    readToken?: string
    dashboardToken?: string
    now?: () => number
}
type Variables = { canManage: boolean }

export function createStatusApi(database: StatusDatabase, options: StatusOptions = {}) {
    const app = new Hono<{ Variables: Variables }>()
    const now = options.now ?? Date.now
    const counters: StatusJobPage['ingestion'] = { rejectedEvents: 0, storageErrors: 0, lastAcceptedAt: null, lastSweepAt: null }
    const buckets = new Map<string, { tokens: number; at: number }>()
    const token = (authorization: string | undefined) => authorization?.startsWith('Bearer ') ? authorization.slice(7) : ''

    app.onError((error, c) => {
        if (error instanceof StatusError) {
            if (c.req.path.endsWith('/events')) counters.rejectedEvents++
            return c.json({ error: error.message }, error.status)
        }
        counters.storageErrors++
        console.error('Status API operation failed:', error)
        return c.json({ error: 'Status storage is unavailable; retry later' }, 503)
    })
    app.use('*', bodyLimit({ maxSize: MAX_EVENT_BYTES, onError: c => {
        counters.rejectedEvents++
        return c.json({ error: 'Request exceeds 64 KiB' }, 413)
    } }))
    app.use('*', async (c, next) => {
        const path = c.req.path.replace(/^\/api\/status\/v1/, '')
        if (path === '/dashboard') {
            c.header('Cache-Control', 'no-store')
            c.header('Referrer-Policy', 'no-referrer')
            if (c.req.method !== 'GET') throw new StatusError('Dashboard access is read-only', 403)
            const dashboardToken = options.dashboardToken
            if (!dashboardToken || dashboardToken.length < 12) {
                throw new StatusError('Set STATUS_DASHBOARD_TOKEN to at least 12 characters to enable the dashboard', 503)
            }
            if (dashboardToken === options.adminToken || dashboardToken === options.readToken) {
                throw new StatusError('STATUS_DASHBOARD_TOKEN must be different from admin and general read tokens', 503)
            }
            const supplied = token(c.req.header('Authorization'))
            if (!supplied || !tokenMatches(supplied, hashToken(dashboardToken))) throw new StatusError('Invalid dashboard read token', 401)
            await next()
            return
        }
        if (c.req.method === 'POST' && /^\/jobs\/[^/]+\/events$/.test(path)) {
            await next()
            return
        }
        const admin = options.adminToken
        if (!admin || admin.length < 32) throw new StatusError('Set STATUS_ADMIN_TOKEN to at least 32 characters to enable Status', 503)
        const supplied = token(c.req.header('Authorization'))
        const canManage = supplied !== '' && tokenMatches(supplied, hashToken(admin))
        const canRead = options.readToken && options.readToken.length >= 32 && supplied !== '' && tokenMatches(supplied, hashToken(options.readToken))
        if (!canManage && !canRead) throw new StatusError('Status authorization required', 401)
        if (c.req.method !== 'GET' && !canManage) throw new StatusError('Administrator token required', 403)
        c.set('canManage', canManage)
        await next()
    })

    function job(id: string) {
        const row = database.select().from(statusJobs).where(eq(statusJobs.id, id)).get()
        if (!row) throw new StatusError('Unknown status job', 404)
        return row
    }
    function pagination(query: (name: string) => string | undefined) {
        const limit = Number(query('limit') ?? 50)
        const offset = Number(query('offset') ?? 0)
        if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100 || !Number.isSafeInteger(offset) || offset < 0) {
            throw new StatusError('limit must be 1-100 and offset a nonnegative integer')
        }
        return { limit, offset }
    }
    async function json(request: { json: () => Promise<unknown> }) {
        try { return await request.json() }
        catch (error) {
            if (error instanceof SyntaxError) throw new StatusError('Malformed JSON')
            throw error
        }
    }
    function sweep() {
        const time = now()
        if (counters.lastSweepAt !== null && time - counters.lastSweepAt < 60000) return
        try {
            sweepStatusRetention(database, time)
            counters.lastSweepAt = time
        } catch (error) {
            counters.storageErrors++
            console.error('Status retention failed:', error)
            throw new StatusError('Status retention failed; storage requires attention', 503)
        }
    }
    app.get('/dashboard', c => {
        const time = now()
        const jobs = database.select().from(statusJobs).where(eq(statusJobs.archived, false)).all()
            .filter(row => row.tags.some(tag => tag.trim().toLowerCase() === 'dashboard'))
            .map(row => summarizeStatusJob(database, row, time))
            .sort((a, b) => Number(b.needsAttention) - Number(a.needsAttention) || a.name.localeCompare(b.name))
            .map(row => ({
                id: row.id,
                name: row.name,
                mode: row.mode,
                needsAttention: row.needsAttention,
                conditions: row.conditions,
                lastRunAt: row.lastRun?.finishedAt ?? null,
                lastOutcome: row.lastRun && row.lastRun.outcome !== 'running' ? row.lastRun.outcome : null,
                activeRunCount: row.activeRuns.length,
                activeRunStartedAt: row.activeRuns.length ? Math.max(...row.activeRuns.map(run => run.startedAt ?? run.firstReceivedAt)) : null,
                lastSeenAt: row.lastSeenAt,
                serviceHealth: row.serviceHealth,
            }))
        const result: DashboardSummary = { jobs, evaluatedAt: time }
        return c.json(result)
    })
    app.post('/jobs/:jobId/events', async c => {
        const row = job(c.req.param('jobId'))
        const supplied = token(c.req.header('Authorization'))
        if (!supplied || !tokenMatches(supplied, row.tokenHash)) throw new StatusError('Invalid job reporting token', 401)
        const time = now()
        const bucket = buckets.get(row.id) ?? { tokens: 120, at: time }
        bucket.tokens = Math.min(120, bucket.tokens + Math.max(0, time - bucket.at) / 1000 * 2)
        bucket.at = time
        buckets.set(row.id, bucket)
        if (bucket.tokens < 1) {
            c.header('Retry-After', '1')
            throw new StatusError('Reporting rate exceeded; retry later', 429)
        }
        bucket.tokens--
        const event = validateEvent(await json(c.req))
        const receivedAt = now()
        const duplicate = ingestStatusEvent(database, row, event, receivedAt)
        counters.lastAcceptedAt = receivedAt
        return c.json({ accepted: true, duplicate, eventId: event.eventId }, duplicate ? 200 : 201)
    })
    app.get('/jobs', c => {
        sweep()
        const page = pagination(name => c.req.query(name))
        const time = now()
        const search = (c.req.query('search') ?? '').toLowerCase()
        const mode = c.req.query('mode')
        const condition = c.req.query('condition')
        const archived = c.req.query('archived') === 'true'
        const summaries = database.select().from(statusJobs).where(eq(statusJobs.archived, archived)).all()
            .map(row => summarizeStatusJob(database, row, time))
            .filter(row => (!mode || row.mode === mode) && (!condition || (condition === 'attention' ? row.needsAttention : row.conditions.some(value => value === condition))) &&
                (!search || [row.name, row.id, row.description, ...row.tags, ...row.activeRuns.map(run => run.source ?? ''), row.lastRun?.source ?? '', row.lastHeartbeat?.payload?.source ?? ''].some(value => value.toLowerCase().includes(search))))
            .sort((a, b) => Number(b.needsAttention) - Number(a.needsAttention) || a.name.localeCompare(b.name))
        const result: StatusJobPage = {
            ...page, items: summaries.slice(page.offset, page.offset + page.limit), total: summaries.length,
            evaluatedAt: time, canManage: c.get('canManage'), ingestion: { ...counters },
        }
        return c.json(result)
    })
    app.post('/jobs/:jobId', async c => {
        const id = validateJobId(c.req.param('jobId'))
        const config = validateJobConfig(await json(c.req))
        if (database.select().from(statusJobs).where(eq(statusJobs.id, id)).get()) throw new StatusError('Job already exists', 409)
        const { token: reportingToken, tokenHash } = newReportingToken()
        database.insert(statusJobs).values({ id, ...config, tokenHash, createdAt: now() }).run()
        return c.json({ id, reportingToken }, 201)
    })
    app.put('/jobs/:jobId', async c => {
        const row = job(c.req.param('jobId'))
        const config = validateJobConfig(await json(c.req))
        const changedSchedule = config.mode !== row.mode || config.anchorAt !== row.anchorAt || config.intervalSeconds !== row.intervalSeconds
        database.update(statusJobs).set({
            ...config,
            ...(changedSchedule ? { scheduleEpoch: row.scheduleEpoch + 1, retiredMatches: 0 } : {}),
        }).where(eq(statusJobs.id, row.id)).run()
        return c.json({ updated: true })
    })
    app.patch('/jobs/:jobId', async c => {
        const row = job(c.req.param('jobId'))
        const body = await json(c.req)
        if (!body || typeof body !== 'object' || Array.isArray(body)) throw new StatusError('Expected pause/archive object')
        const values = Object.entries(body)
        if (!values.length || values.some(([key, value]) => !['paused', 'archived'].includes(key) || typeof value !== 'boolean')) {
            throw new StatusError('Only boolean paused and archived fields are accepted')
        }
        const update: { paused?: boolean; archived?: boolean } = {}
        for (const [key, value] of values) {
            if (key === 'paused' && typeof value === 'boolean') update.paused = value
            if (key === 'archived' && typeof value === 'boolean') update.archived = value
        }
        database.update(statusJobs).set(update).where(eq(statusJobs.id, row.id)).run()
        return c.json({ updated: true })
    })
    app.post('/jobs/:jobId/token', c => {
        const row = job(c.req.param('jobId'))
        const { token: reportingToken, tokenHash } = newReportingToken()
        database.update(statusJobs).set({ tokenHash }).where(eq(statusJobs.id, row.id)).run()
        return c.json({ reportingToken })
    })
    app.get('/jobs/:jobId/runs', c => {
        const row = job(c.req.param('jobId'))
        const page = pagination(name => c.req.query(name))
        const where = eq(statusRuns.jobId, row.id)
        const items = database.select().from(statusRuns).where(where).orderBy(desc(sql`coalesce(${statusRuns.startedAt}, ${statusRuns.firstReceivedAt})`), desc(statusRuns.key))
            .limit(page.limit).offset(page.offset).all().map(statusRunDetail)
        const total = database.select({ count: sql<number>`count(*)` }).from(statusRuns).where(where).get()?.count ?? 0
        return c.json({ ...page, items, total })
    })
    app.get('/jobs/:jobId/runs/:runId', c => {
        const row = job(c.req.param('jobId'))
        const runId = c.req.param('runId')
        const run = database.select().from(statusRuns).where(and(eq(statusRuns.jobId, row.id), eq(statusRuns.id, runId))).get()
        if (!run) throw new StatusError('Unknown run', 404)
        const page = pagination(name => c.req.query(name))
        const where = and(eq(statusEvents.jobId, row.id), eq(statusEvents.runId, runId))
        const items = database.select({
            eventId: statusEvents.eventId, runId: statusEvents.runId, sequence: statusEvents.sequence, type: statusEvents.type,
            receivedAt: statusEvents.receivedAt, occurredAt: statusEvents.occurredAt, clockSkewMs: statusEvents.clockSkewMs, payload: statusEvents.payload,
        }).from(statusEvents).where(where).orderBy(asc(statusEvents.sequence)).limit(page.limit).offset(page.offset).all()
        const total = database.select({ count: sql<number>`count(*)` }).from(statusEvents).where(where).get()?.count ?? 0
        return c.json({ run: statusRunDetail(run), events: { ...page, items, total } })
    })
    app.notFound(c => c.json({ error: 'Unknown status endpoint' }, 404))
    return { app, sweep }
}
