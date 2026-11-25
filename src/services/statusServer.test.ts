import { afterEach, beforeEach, describe, expect, spyOn, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import { migrate } from 'drizzle-orm/bun-sqlite/migrator'
import { eq } from 'drizzle-orm'
import { Hono } from 'hono'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import * as schema from '../db/schema'
import type { DashboardSummary, StatusEventInput, StatusJobConfig, StatusJobPage, StatusPage, StatusRun } from '../types/status'
import { createStatusApi } from './statusApi'
import { sweepStatusRetention } from './statusServer'
import { validateEvent } from './statusValidation'

const admin = 'test-admin-token-with-at-least-32-characters'
const reader = 'test-reader-token-with-at-least-32-characters'
const dashboardReader = 'pi-read-only'
const BASE = '/api/status/v1'
let sqlite: Database
let database: ReturnType<typeof drizzle<typeof schema>>
let app: Hono
let time: number
const originalTime = Date.parse('2026-11-21T18:00:00Z')

beforeEach(() => {
    sqlite = new Database(':memory:')
    sqlite.exec('PRAGMA foreign_keys = ON')
    database = drizzle(sqlite, { schema })
    migrate(database, { migrationsFolder: new URL('../../drizzle', import.meta.url).pathname })
    time = originalTime
    app = new Hono().route(BASE, createStatusApi(database, { adminToken: admin, readToken: reader, dashboardToken: dashboardReader, now: () => time }).app)
})
afterEach(() => sqlite.close())

async function request(path: string, method = 'GET', body?: unknown, credential = admin): Promise<Response> {
    return app.request(`${BASE}${path}`, {
        method,
        headers: { Authorization: `Bearer ${credential}`, 'Content-Type': 'application/json' },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    })
}
async function register(id = 'backup', config: Partial<StatusJobConfig> = {}): Promise<string> {
    const response = await request(`/jobs/${id}`, 'POST', {
        name: id, description: '', tags: ['ubuntu'], mode: 'manual', ...config,
    })
    expect(response.status).toBe(201)
    const result = await response.json() as { reportingToken: string }
    return result.reportingToken
}
function event(type: StatusEventInput['type'], runId: string, sequence: number, extra: Partial<StatusEventInput> = {}): StatusEventInput {
    return { eventId: crypto.randomUUID(), runId, sequence, type, ...extra }
}
async function report(credential: string, value: StatusEventInput, id = 'backup') {
    return request(`/jobs/${id}/events`, 'POST', value, credential)
}
async function summaries() {
    const response = await request('/jobs')
    expect(response.status).toBe(200)
    return (await response.json() as StatusJobPage).items
}

describe('universal status API', () => {
    test('admin can close one interrupted run with an audited failure while preserving other runs and liveness', async () => {
        const reporting = await register()
        const interrupted = crypto.randomUUID()
        await report(reporting, event('started', interrupted, 0))
        time += 1000
        const other = crypto.randomUUID()
        await report(reporting, event('started', other, 0))
        const completed = crypto.randomUUID()
        await report(reporting, event('completed', completed, 1, { outcome: 'succeeded' }))
        const lastSeenAt = time
        time += 10000
        const response = await request(`/jobs/backup/runs/${interrupted}/fail`, 'POST', { reason: ' Interrupted during restart. ' })
        expect(response.status).toBe(200)
        const result = await response.json() as { run: StatusRun }
        expect(result.run).toMatchObject({
            outcome: 'failed', rawStatus: 'manually_failed', exitCode: null, finishedAt: time,
            message: 'Interrupted during restart.', durationMs: 11000,
        })
        const job = (await summaries())[0]!
        expect(job.activeRuns.map(run => run.id)).toEqual([other])
        expect(job.lastRun?.id).toBe(completed)
        expect(job.lastRun?.outcome).toBe('succeeded')
        expect(job.lastSeenAt).toBe(lastSeenAt)
        const detail = await (await request(`/jobs/backup/runs/${interrupted}`)).json() as { events: StatusPage<{ payload: StatusEventInput }> }
        expect(detail.events.items[1]?.payload).toMatchObject({
            type: 'completed', sequence: 1, outcome: 'failed',
            metadata: { resolvedBy: 'admin', reason: 'Interrupted during restart.' },
        })
        expect((await request(`/jobs/backup/runs/${interrupted}/fail`, 'POST', { reason: 'Retry' })).status).toBe(409)
        expect((await report(reporting, event('completed', interrupted, 1, { outcome: 'succeeded' }))).status).toBe(409)
        expect((await report(reporting, event('progress', interrupted, 2))).status).toBe(409)
        expect(database.select().from(schema.statusEvents).all()).toHaveLength(4)
    })

    test('manual resolution is admin-only and validates run identity, state, and reason', async () => {
        const reporting = await register()
        const id = crypto.randomUUID()
        await report(reporting, event('started', id, 0))
        const path = `/jobs/backup/runs/${id}/fail`
        expect((await request(path, 'POST', { reason: 'Interrupted' }, reader)).status).toBe(403)
        expect((await request(path, 'POST', { reason: 'Interrupted' }, reporting)).status).toBe(401)
        expect((await request(path, 'POST', { reason: 'Interrupted' }, dashboardReader)).status).toBe(401)
        for (const body of [{}, { reason: '' }, { reason: ' ' }, { reason: 5 }, { reason: 'x'.repeat(1025) }, { reason: 'Interrupted', outcome: 'succeeded' }]) {
            expect((await request(path, 'POST', body)).status).toBe(400)
        }
        expect((await request(`/jobs/backup/runs/${crypto.randomUUID()}/fail`, 'POST', { reason: 'Interrupted' })).status).toBe(404)
        expect((await request(`/jobs/missing/runs/${id}/fail`, 'POST', { reason: 'Interrupted' })).status).toBe(404)
        await report(reporting, event('completed', id, 1, { outcome: 'succeeded' }))
        expect((await request(path, 'POST', { reason: 'Interrupted' })).status).toBe(409)
        expect((await summaries())[0]?.lastRun?.outcome).toBe('succeeded')
    })

    test('manual resolution closes an old run after schedule edits and leaves long-running jobs alone', async () => {
        const reporting = await register()
        const id = crypto.randomUUID()
        await report(reporting, event('started', id, 0))
        time += 10 * 86400000
        expect((await summaries())[0]?.activeRuns).toHaveLength(1)
        expect((await summaries())[0]?.conditions).not.toContain('overdue')
        await request('/jobs/backup', 'PUT', { name: 'backup', mode: 'scheduled', intervalSeconds: 86400, anchorAt: time })
        expect((await request(`/jobs/backup/runs/${id}/fail`, 'POST', { reason: 'Interrupted ten days ago' })).status).toBe(200)
        const job = (await summaries())[0]!
        expect(job.activeRuns).toHaveLength(0)
        expect(job.lastRun?.outcome).toBe('failed')
        expect(job.needsAttention).toBe(true)
    })

    test('dashboard token grants only dashboard summaries and requires explicit configuration', async () => {
        expect((await request('/dashboard', 'GET', undefined, dashboardReader)).status).toBe(200)
        expect((await request('/dashboard', 'GET', undefined, '')).status).toBe(401)
        expect((await request(`/dashboard?token=${dashboardReader}`, 'GET', undefined, '')).status).toBe(401)
        expect((await request('/dashboard', 'POST', {}, dashboardReader)).status).toBe(403)
        expect((await request('/jobs', 'GET', undefined, dashboardReader)).status).toBe(401)
        expect((await request('/jobs/backup/runs', 'GET', undefined, dashboardReader)).status).toBe(401)
        expect((await request('/jobs/backup/token', 'POST', undefined, dashboardReader)).status).toBe(401)
        for (const dashboardToken of [undefined, 'too-short', admin]) {
            const restricted = createStatusApi(database, { adminToken: admin, dashboardToken }).app
            const response = await restricted.request('/dashboard', { headers: { Authorization: `Bearer ${dashboardReader}` } })
            expect(response.status).toBe(503)
        }
    })

    test('dashboard lists exact dashboard-tagged jobs only, without logs or metadata', async () => {
        const reporting = await register('visible', { name: 'NAS Backup', tags: ['dashboard', 'backup'] })
        await register('hidden', { name: 'Dashboard in name only', tags: ['ubuntu'] })
        await register('partial', { tags: ['dashboard-extra'] })
        await register('archived', { tags: ['dashboard'] })
        await request('/jobs/archived', 'PATCH', { archived: true })
        await register('unknown', { tags: [' DASHBOARD '] })
        const id = crypto.randomUUID()
        await report(reporting, event('started', id, 0), 'visible')
        time += 1000
        await report(reporting, event('completed', id, 1, { outcome: 'succeeded', message: 'private details', metadata: { secret: 'private' }, log: 'private log' }), 'visible')
        const response = await request('/dashboard', 'GET', undefined, dashboardReader)
        expect(response.headers.get('Cache-Control')).toBe('no-store')
        expect(response.headers.get('Referrer-Policy')).toBe('no-referrer')
        const result = await response.json() as DashboardSummary
        expect(result.jobs.map(job => job.id)).toEqual(['unknown', 'visible'])
        expect(result.jobs[0]?.needsAttention).toBe(true)
        expect(result.jobs[1]).toMatchObject({ name: 'NAS Backup', lastOutcome: 'succeeded', lastRunAt: time, needsAttention: false })
        expect(JSON.stringify(result)).not.toContain('private')
        expect(JSON.stringify(result)).not.toContain('tokenHash')
        expect(result.evaluatedAt).toBe(time)
    })

    test('dashboard shows every tagged job rather than truncating to an admin pagination limit', async () => {
        database.insert(schema.statusJobs).values(Array.from({ length: 105 }, (_, index) => ({
            id: `dashboard-${index}`, name: `Job ${index}`, tags: ['dashboard'], mode: 'manual' as const,
            tokenHash: 'test-only-unused-hash', createdAt: time,
        }))).run()
        const response = await request('/dashboard', 'GET', undefined, dashboardReader)
        expect((await response.json() as DashboardSummary).jobs).toHaveLength(105)
    })

    test('dashboard separates failed, unknown, active, and paused monitoring states', async () => {
        const reporting = await register('failed', { tags: ['dashboard'] })
        const id = crypto.randomUUID()
        await report(reporting, event('completed', id, 0, { outcome: 'failed' }), 'failed')
        time += 1000
        await report(reporting, event('started', crypto.randomUUID(), 0), 'failed')
        await register('paused', { tags: ['dashboard'] })
        await request('/jobs/paused', 'PATCH', { paused: true })
        const response = await request('/dashboard', 'GET', undefined, dashboardReader)
        const jobs = (await response.json() as DashboardSummary).jobs
        expect(jobs.find(job => job.id === 'failed')).toMatchObject({ needsAttention: true, lastOutcome: 'failed', activeRunCount: 1, activeRunStartedAt: time })
        expect(jobs.find(job => job.id === 'paused')).toMatchObject({ needsAttention: false, conditions: ['paused'] })
    })

    test('separates administrator, reader, and per-job reporting permissions', async () => {
        const reporting = await register()
        const other = await register('other')
        expect((await request('/jobs', 'GET', undefined, '')).status).toBe(401)
        expect((await request('/jobs', 'GET', undefined, reporting)).status).toBe(401)
        expect((await request('/jobs/backup/token', 'POST', undefined, reader)).status).toBe(403)
        const response = await request('/jobs', 'GET', undefined, reader)
        const json = await response.json() as StatusJobPage
        expect(json.canManage).toBe(false)
        expect(JSON.stringify(json)).not.toContain('tokenHash')
        expect(JSON.stringify(json)).not.toContain(reporting)
        expect((await report(other, event('started', crypto.randomUUID(), 0))).status).toBe(401)
        const rotated = await (await request('/jobs/backup/token', 'POST')).json() as { reportingToken: string }
        expect((await report(reporting, event('started', crypto.randomUUID(), 0))).status).toBe(401)
        expect((await report(rotated.reportingToken, event('started', crypto.randomUUID(), 0))).status).toBe(201)
        const disabled = createStatusApi(database).app
        expect((await disabled.request('/jobs')).status).toBe(503)
    })

    test('accepts arbitrary job metadata and completion without a start or exit code', async () => {
        const reporting = await register()
        const runId = crypto.randomUUID()
        expect((await report(reporting, event('completed', runId, 7, {
            outcome: 'succeeded', rawStatus: 'completed-with-warnings', metadata: { warnings: ['file excluded'], tool: { name: 'custom' } },
            metrics: { files: { value: 42, unit: 'files' } },
        }))).status).toBe(201)
        const job = (await summaries())[0]!
        expect(job.lastRun).toMatchObject({ id: runId, outcome: 'succeeded', startedAt: null, durationMs: null, exitCode: null })
        expect(job.needsAttention).toBe(false)
    })

    test('deduplicates canonical payloads and rejects reused event IDs or sequences atomically', async () => {
        const reporting = await register()
        const value = event('started', crypto.randomUUID(), 0, { metadata: { a: 1, b: 2 } })
        expect((await report(reporting, value)).status).toBe(201)
        const duplicate = await report(reporting, { ...value, metadata: { b: 2, a: 1 } })
        expect(duplicate.status).toBe(200)
        expect(await duplicate.json()).toMatchObject({ duplicate: true })
        expect((await report(reporting, { ...value, message: 'different' })).status).toBe(409)
        expect((await report(reporting, { ...value, eventId: crypto.randomUUID() })).status).toBe(409)
        expect(database.select().from(schema.statusEvents).all()).toHaveLength(1)
        expect(database.select().from(schema.statusRuns).all()).toHaveLength(1)
    })

    test('handles out-of-order progress and a delayed start without reopening a terminal run', async () => {
        const reporting = await register()
        const id = crypto.randomUUID()
        expect((await report(reporting, event('progress', id, 2, { progress: { current: 20 }, message: 'newer' }))).status).toBe(201)
        expect((await report(reporting, event('progress', id, 1, { progress: { current: 10 }, message: 'older' }))).status).toBe(201)
        time += 10000
        expect((await report(reporting, event('completed', id, 3, { outcome: 'failed', exitCode: 17 }))).status).toBe(201)
        expect((await report(reporting, event('started', id, 0, { occurredAt: new Date(originalTime).toISOString() }))).status).toBe(201)
        expect((await report(reporting, event('progress', id, 4))).status).toBe(409)
        expect((await report(reporting, event('completed', id, 5, { outcome: 'succeeded' }))).status).toBe(409)
        const job = (await summaries())[0]!
        expect(job.lastRun).toMatchObject({ outcome: 'failed', progress: { current: 20 }, message: 'newer', durationMs: 10000 })
    })

    test('keeps overlapping runs separate and does not hide failure on a new start', async () => {
        const reporting = await register()
        const older = crypto.randomUUID()
        const newer = crypto.randomUUID()
        await report(reporting, event('started', older, 0))
        time += 1000
        await report(reporting, event('started', newer, 0))
        await report(reporting, event('completed', newer, 1, { outcome: 'failed' }))
        time += 1000
        await report(reporting, event('completed', older, 1, { outcome: 'succeeded' }))
        await report(reporting, event('started', crypto.randomUUID(), 0))
        const job = (await summaries())[0]!
        expect(job.lastRun?.id).toBe(newer)
        expect(job.lastRun?.outcome).toBe('failed')
        expect(job.activeRuns).toHaveLength(1)
        expect(job.needsAttention).toBe(true)
    })

    test('derives missed starts, stale and overdue runs from durable evidence after restart', async () => {
        const reporting = await register('backup', {
            mode: 'scheduled', anchorAt: time, intervalSeconds: 60, graceSeconds: 5,
            heartbeatSeconds: 10, maxRuntimeSeconds: 20,
        })
        await report(reporting, event('started', crypto.randomUUID(), 0))
        time += 70000
        const restarted = createStatusApi(database, { adminToken: admin, now: () => time }).app
        const response = await restarted.request('/jobs', { headers: { Authorization: `Bearer ${admin}` } })
        const job = (await response.json() as StatusJobPage).items[0]!
        expect(job.conditions).toEqual(expect.arrayContaining(['late', 'stale', 'overdue']))
        expect(job.missedStarts).toBe(1)
        expect(job.nextExpectedAt).toBe(originalTime + 120000)
        await report(reporting, event('started', crypto.randomUUID(), 0))
        time += 60000
        expect((await summaries())[0]?.missedStarts).toBe(1)
        await request('/jobs/backup', 'PATCH', { paused: true })
        expect((await summaries())[0]?.conditions).toEqual(['paused'])
        expect((await summaries())[0]?.needsAttention).toBe(false)
        await request('/jobs/backup', 'PATCH', { paused: false })
        expect((await summaries())[0]?.conditions).toContain('late')
    })

    test('service heartbeats enforce freshness and explicit recovery without creating runs', async () => {
        const reporting = await register('daemon', { mode: 'heartbeat', heartbeatSeconds: 30 })
        expect((await summaries())[0]?.conditions).toEqual(['unknown'])
        const heartbeat = (extra: Partial<StatusEventInput> = {}): StatusEventInput => ({
            eventId: crypto.randomUUID(), type: 'heartbeat', occurredAt: new Date(time).toISOString(), ...extra,
        })
        expect((await report(reporting, heartbeat({ occurredAt: new Date(time - 31000).toISOString() }), 'daemon')).status).toBe(410)
        expect((await report(reporting, heartbeat({ health: 'degraded', source: 'nas', message: 'disk almost full' }), 'daemon')).status).toBe(201)
        await report(reporting, heartbeat(), 'daemon')
        expect((await summaries())[0]?.conditions).toContain('reported_unhealthy')
        await report(reporting, heartbeat({ health: 'healthy' }), 'daemon')
        expect((await summaries())[0]?.conditions).toEqual([])
        expect(database.select().from(schema.statusRuns).all()).toHaveLength(0)
        time += 31000
        expect((await summaries())[0]?.conditions).toEqual(['stale'])
    })

    test('validates JSON, bounded metadata, limits, and optional fields', async () => {
        const reporting = await register()
        const base = event('progress', crypto.randomUUID(), 1)
        const invalid = [
            { ...base, progress: { current: 2, total: 1 } },
            { ...base, sequence: -1 },
            { ...base, metadata: [] },
            { ...base, metrics: { bad: { value: '5' } } },
            { ...base, custom: 'use metadata' },
            { ...base, log: 'a'.repeat(16385) },
            { ...base, occurredAt: 'yesterday' },
            { ...base, occurredAt: '2026-02-30T12:00:00Z' },
            { ...base, outcome: 'failed' },
        ]
        for (const input of invalid) expect((await request('/jobs/backup/events', 'POST', input, reporting)).status).toBe(400)
        const malformed = await app.request(`${BASE}/jobs/backup/events`, {
            method: 'POST', headers: { Authorization: `Bearer ${reporting}`, 'Content-Type': 'application/json' }, body: '{',
        })
        expect(malformed.status).toBe(400)
        expect((await report(reporting, { ...base, message: 'a'.repeat(65536) })).status).toBe(413)
        expect((await request('/jobs?limit=0')).status).toBe(400)
        expect((await request('/jobs/invalid/id', 'POST', {})).status).toBe(404)
        const deep = { a: { b: { c: { d: { e: { f: { g: { h: { i: { j: 1 } } } } } } } } } }
        expect(() => validateEvent({ ...base, metadata: deep })).toThrow()
        expect(() => validateEvent({ ...base, progress: { current: Infinity } })).toThrow()
    })

    test('limits reporter bursts and supplies Retry-After', async () => {
        const reporting = await register()
        const value = event('started', crypto.randomUUID(), 0)
        for (let i = 0; i < 120; i++) expect((await report(reporting, value)).status).toBe(i === 0 ? 201 : 200)
        const limited = await report(reporting, value)
        expect(limited.status).toBe(429)
        expect(limited.headers.get('Retry-After')).toBe('1')
        time += 1000
        expect((await report(reporting, value)).status).toBe(200)
    })

    test('rejects expired/future events and old scheduled occurrences without inserting partial runs', async () => {
        const reporting = await register('backup', { mode: 'scheduled', anchorAt: time - 3 * 86400000, intervalSeconds: 86400 })
        const id = crypto.randomUUID()
        expect((await report(reporting, event('started', id, 0, { occurredAt: new Date(time - 86400001).toISOString() }))).status).toBe(410)
        expect((await report(reporting, event('started', id, 0, { occurredAt: new Date(time + 300001).toISOString() }))).status).toBe(400)
        expect((await report(reporting, event('started', id, 0, { scheduledFor: new Date(time - 3 * 86400000).toISOString() }))).status).toBe(410)
        expect(database.select().from(schema.statusRuns).all()).toHaveLength(0)
        expect(database.select().from(schema.statusEvents).all()).toHaveLength(0)
    })

    test('validates edits and archives jobs without losing history', async () => {
        const reporting = await register()
        await report(reporting, event('started', crypto.randomUUID(), 0))
        expect((await request('/jobs/backup', 'PUT', { name: 'updated', mode: 'scheduled', intervalSeconds: 60 })).status).toBe(400)
        expect((await request('/jobs/backup', 'PUT', { name: 'updated', mode: 'scheduled', intervalSeconds: 60, anchorAt: time })).status).toBe(200)
        expect((await request('/jobs/backup', 'PATCH', { tokenHash: 'replace' })).status).toBe(400)
        await request('/jobs/backup', 'PATCH', { archived: true })
        expect((await summaries()).length).toBe(0)
        const archived = await (await request('/jobs?archived=true')).json() as StatusJobPage
        expect(archived.items[0]?.conditions).toEqual(['paused'])
        expect(archived.items[0]?.activeRuns).toHaveLength(1)
        await request('/jobs/backup', 'PATCH', { archived: false })
        expect((await summaries())[0]?.name).toBe('updated')
    })

    test('surfaces database unavailability as a logged 503 instead of a healthy empty list', async () => {
        const brokenSqlite = new Database(':memory:')
        const broken = createStatusApi(drizzle(brokenSqlite, { schema }), { adminToken: admin }).app
        const log = spyOn(console, 'error').mockImplementation(() => {})
        try {
            const response = await broken.request('/jobs', { headers: { Authorization: `Bearer ${admin}` } })
            expect(response.status).toBe(503)
            expect(await response.json()).toMatchObject({ error: expect.stringContaining('storage') })
            expect(log).toHaveBeenCalled()
        } finally {
            log.mockRestore()
            brokenSqlite.close()
        }
    })

    test('compacts expired payloads but retains active runs, health evidence, and deduplication identities', async () => {
        const reporting = await register()
        const first = event('started', crypto.randomUUID(), 0)
        await report(reporting, first)
        await report(reporting, event('completed', first.runId!, 1, { outcome: 'succeeded' }))
        const second = event('started', crypto.randomUUID(), 0)
        time += 1000
        await report(reporting, second)
        await report(reporting, event('completed', second.runId!, 1, { outcome: 'failed' }))
        const active = event('started', crypto.randomUUID(), 0)
        time += 1000
        await report(reporting, active)
        const daemon = await register('daemon', { mode: 'heartbeat', heartbeatSeconds: 60 })
        await report(daemon, { eventId: crypto.randomUUID(), type: 'heartbeat', health: 'healthy', occurredAt: new Date(time).toISOString(), message: 'retained current evidence' }, 'daemon')
        time += 400 * 86400000
        sweepStatusRetention(database, time)
        const stored = database.select().from(schema.statusEvents).where(eq(schema.statusEvents.eventId, first.eventId)).get()
        expect(stored?.payload).toBeNull()
        expect((await report(reporting, first)).status).toBe(200)
        expect(database.select().from(schema.statusRuns).all()).toHaveLength(3)
        const health = (await summaries()).find(job => job.id === 'daemon')
        expect(health?.lastHeartbeat?.payload?.message).toBe('retained current evidence')
    })

    test('retires old run summaries without losing historical schedule matches or recreating a retired run', async () => {
        const reporting = await register('backup', { mode: 'scheduled', anchorAt: time, intervalSeconds: 86400, graceSeconds: 0 })
        const old = event('started', crypto.randomUUID(), 0)
        await report(reporting, old)
        await report(reporting, event('completed', old.runId!, 1, { outcome: 'failed' }))
        time += 86400000
        const newest = event('started', crypto.randomUUID(), 0)
        await report(reporting, newest)
        await report(reporting, event('completed', newest.runId!, 1, { outcome: 'succeeded' }))
        time += 400 * 86400000
        const before = (await summaries())[0]!.missedStarts
        expect(before).toBe(400)
        sweepStatusRetention(database, time)
        expect((await summaries())[0]!.missedStarts).toBe(before)
        expect(database.select().from(schema.statusRuns).all()).toHaveLength(1)
        expect((await report(reporting, event('log', old.runId!, 2, { log: 'too late' }))).status).toBe(410)
        expect((await report(reporting, old)).status).toBe(200)
    })

    test('provides paginated run timelines and explicit routing errors', async () => {
        const reporting = await register()
        const id = crypto.randomUUID()
        await report(reporting, event('started', id, 0))
        await report(reporting, event('log', id, 1, { log: '<script>not executed</script>', severity: 'warning' }))
        await report(reporting, event('completed', id, 2, { outcome: 'succeeded', exitCode: 24 }))
        const response = await request(`/jobs/backup/runs/${id}?limit=1&offset=1`)
        const body = await response.json() as { run: StatusRun; events: StatusPage<{ payload: StatusEventInput }> }
        expect(body.run.outcome).toBe('succeeded')
        expect(body.events.total).toBe(3)
        expect(body.events.items[0]?.payload.log).toBe('<script>not executed</script>')
        expect((await request('/jobs/missing/runs')).status).toBe(404)
        expect((await request('/no-such-endpoint')).status).toBe(404)
    })
})

describe('Bash producer wrapper', () => {
    test('retries transient HTTP failures with the identical event identity and payload', async () => {
        const received: string[] = []
        const server = Bun.serve({
            port: 0, hostname: '127.0.0.1',
            fetch: async request => {
                received.push(await request.text())
                return new Response('', { status: received.length === 1 ? 503 : 201 })
            },
        })
        const directory = mkdtempSync(join(tmpdir(), 'wolf-status-test-'))
        try {
            const child = Bun.spawn(['bash', new URL('../../scripts/wolf-status-run.sh', import.meta.url).pathname, 'backup', 'bash', '-c', 'exit 0'], {
                env: { ...process.env, WOLF_URL: `http://127.0.0.1:${server.port}`, WOLF_STATUS_TOKEN: 'test-only', WOLF_STATUS_LOG_DIR: directory },
                stdout: 'pipe', stderr: 'pipe',
            })
            const [code] = await Promise.all([child.exited, new Response(child.stdout).text(), new Response(child.stderr).text()])
            expect(code).toBe(0)
            expect(received).toHaveLength(3)
            expect(received[0]).toBe(received[1])
            expect(JSON.parse(received[2]!).type).toBe('completed')
        } finally {
            server.stop(true)
            rmSync(directory, { recursive: true })
        }
    })

    test('reports a real command and preserves its failing exit code and local output', async () => {
        const reporting = await register()
        // The production adapter is tested over HTTP, not only Hono's in-process request helper.
        const httpApi = createStatusApi(database, { adminToken: admin }).app
        const server = Bun.serve({ port: 0, hostname: '127.0.0.1', fetch: new Hono().route(BASE, httpApi).fetch })
        const directory = mkdtempSync(join(tmpdir(), 'wolf-status-test-'))
        try {
            const child = Bun.spawn(['bash', new URL('../../scripts/wolf-status-run.sh', import.meta.url).pathname, 'backup', 'bash', '-c', 'printf "task output\\n"; exit 7'], {
                env: { ...process.env, WOLF_URL: `http://127.0.0.1:${server.port}`, WOLF_STATUS_TOKEN: reporting, WOLF_STATUS_LOG_DIR: directory, WOLF_STATUS_SEND_LOGS: '1' },
                stdout: 'pipe', stderr: 'pipe',
            })
            const [code, output] = await Promise.all([child.exited, new Response(child.stdout).text(), new Response(child.stderr).text()])
            expect(code).toBe(7)
            expect(output).toContain('task output')
            const run = database.select().from(schema.statusRuns).get()
            expect(run?.outcome).toBe('failed')
            expect(run?.exitCode).toBe(7)
            const logs = database.select().from(schema.statusEvents).all().filter(row => row.type === 'log')
            expect(logs[0]?.payload?.log).toContain('task output')
        } finally {
            server.stop(true)
            rmSync(directory, { recursive: true })
        }
    })

    test('preserves task success when reporting is rejected and prints explicit diagnostics', async () => {
        const server = Bun.serve({ port: 0, hostname: '127.0.0.1', fetch: () => new Response('denied', { status: 403 }) })
        const directory = mkdtempSync(join(tmpdir(), 'wolf-status-test-'))
        try {
            const child = Bun.spawn(['bash', new URL('../../scripts/wolf-status-run.sh', import.meta.url).pathname, 'backup', 'bash', '-c', 'printf "still ran\\n"'], {
                env: { ...process.env, WOLF_URL: `http://127.0.0.1:${server.port}`, WOLF_STATUS_TOKEN: 'invalid', WOLF_STATUS_LOG_DIR: directory },
                stdout: 'pipe', stderr: 'pipe',
            })
            const [code, output, diagnostics] = await Promise.all([child.exited, new Response(child.stdout).text(), new Response(child.stderr).text()])
            expect(code).toBe(0)
            expect(output).toContain('still ran')
            expect(diagnostics).toContain('HTTP=403')
            expect(diagnostics).toContain('completion was not delivered')
        } finally {
            server.stop(true)
            rmSync(directory, { recursive: true })
        }
    })
})
