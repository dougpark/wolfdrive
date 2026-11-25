import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import { and, desc, eq, isNotNull, lt, ne, sql } from 'drizzle-orm'
import type { db } from '../db'
import { statusEvents, statusJobs, statusRuns } from '../db/schema'
import type { StatusEventInput, StatusJobSummary, StatusRun } from '../types/status'
import { MAX_CLOCK_SKEW_MS, MAX_DELIVERY_AGE_MS, StatusError, timestamp } from './statusValidation'

export type StatusDatabase = typeof db
type Job = typeof statusJobs.$inferSelect
type Run = typeof statusRuns.$inferSelect
const DAY = 86400000

export function hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex')
}

export function tokenMatches(token: string, hash: string): boolean {
    const candidate = Buffer.from(hashToken(token), 'hex')
    const expected = Buffer.from(hash, 'hex')
    return candidate.length === expected.length && timingSafeEqual(candidate, expected)
}

export function newReportingToken(): { token: string; tokenHash: string } {
    const token = randomBytes(32).toString('base64url')
    return { token, tokenHash: hashToken(token) }
}

function canonical(value: unknown): string {
    if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
    if (value !== null && typeof value === 'object') {
        return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(',')}}`
    }
    return JSON.stringify(value)
}

function asRun(run: Run): StatusRun {
    const { key, ...publicRun } = run
    return { ...publicRun, durationMs: run.startedAt !== null && run.finishedAt !== null ? Math.max(0, run.finishedAt - run.startedAt) : null }
}

function runOrder(run: Run): number {
    return run.startedAt ?? run.firstReceivedAt
}

function scheduleIndex(job: Job, event: StatusEventInput, now: number): number | null {
    if (job.mode !== 'scheduled' || job.anchorAt === null || job.intervalSeconds === null) {
        if (event.scheduledFor !== undefined) throw new StatusError('scheduledFor requires a scheduled job')
        return null
    }
    const interval = job.intervalSeconds * 1000
    if (event.scheduledFor !== undefined) {
        const time = timestamp(event.scheduledFor, 'scheduledFor')
        if (event.type === 'started' && time < now - MAX_DELIVERY_AGE_MS) {
            throw new StatusError('Scheduled start occurrence is more than 24 hours old', 410)
        }
        const index = (time - job.anchorAt) / interval
        if (!Number.isSafeInteger(index) || index < 0 || time > now + MAX_CLOCK_SKEW_MS) {
            throw new StatusError('scheduledFor must be a due occurrence on the configured interval grid')
        }
        return index
    }
    if (event.type !== 'started') return null
    const time = event.occurredAt ? timestamp(event.occurredAt, 'occurredAt') : now
    const index = Math.floor((time - job.anchorAt) / interval)
    return index >= 0 ? index : null
}

export function ingestStatusEvent(database: StatusDatabase, job: Job, event: StatusEventInput, now = Date.now()): boolean {
    const payloadHash = hashToken(canonical(event))
    return database.transaction(tx => {
        const duplicate = tx.select().from(statusEvents)
            .where(and(eq(statusEvents.jobId, job.id), eq(statusEvents.eventId, event.eventId))).get()
        if (duplicate) {
            if (duplicate.payloadHash !== payloadHash) throw new StatusError('eventId was already used with different content', 409)
            return true
        }
        const occurredAt = event.occurredAt ? timestamp(event.occurredAt, 'occurredAt') : null
        if (occurredAt !== null && occurredAt < now - MAX_DELIVERY_AGE_MS) throw new StatusError('Event delivery age exceeds 24 hours', 410)
        if (occurredAt !== null && occurredAt > now + MAX_CLOCK_SKEW_MS) throw new StatusError('Event timestamp is more than five minutes in the future')
        const serviceHeartbeat = event.type === 'heartbeat' && !event.runId
        if (serviceHeartbeat) {
            if (job.mode !== 'heartbeat') throw new StatusError('Service heartbeats require heartbeat monitoring mode')
            if (occurredAt === null) throw new StatusError('Service heartbeats require occurredAt for freshness checking')
            const freshness = Math.min(MAX_CLOCK_SKEW_MS, (job.heartbeatSeconds ?? 300) * 1000)
            if (occurredAt < now - freshness) throw new StatusError('Service heartbeat is too old to establish liveness', 410)
            const current = tx.select().from(statusJobs).where(eq(statusJobs.id, job.id)).get()
            if (!current) throw new StatusError('Unknown status job', 404)
            tx.update(statusJobs).set({
                lastSeenAt: now,
                lastServiceHeartbeatAt: now,
                // A health-less heartbeat establishes liveness, not recovery from an explicit failure.
                serviceHealth: event.health ?? current.serviceHealth,
            }).where(eq(statusJobs.id, job.id)).run()
        } else {
            if (!event.runId || event.sequence === undefined) throw new StatusError('Run identity is required')
            const sequence = event.sequence
            const collision = tx.select().from(statusEvents).where(and(
                eq(statusEvents.jobId, job.id), eq(statusEvents.runId, event.runId), eq(statusEvents.sequence, sequence),
            )).get()
            if (collision) throw new StatusError('sequence was already used by another event', 409)
            let run = tx.select().from(statusRuns).where(and(eq(statusRuns.jobId, job.id), eq(statusRuns.id, event.runId))).get()
            if (!run) {
                // Tombstones remain after run retention, preventing forgotten runs from being recreated.
                const retired = tx.select({ key: statusEvents.key }).from(statusEvents).where(and(
                    eq(statusEvents.jobId, job.id), eq(statusEvents.runId, event.runId),
                )).limit(1).get()
                if (retired) throw new StatusError('Run summary has expired', 410)
                run = tx.insert(statusRuns).values({
                    id: event.runId, jobId: job.id, firstReceivedAt: now, scheduleEpoch: job.scheduleEpoch,
                }).returning().get()
                if (!run) throw new Error('Unable to create run')
            }
            if (event.type === 'completed' && run.terminalSequence !== null) {
                throw new StatusError('Run already has a terminal event', 409)
            }
            if (run.terminalSequence !== null && sequence >= run.terminalSequence) {
                throw new StatusError('Only delayed events preceding completion are accepted', 409)
            }
            if (event.type === 'completed' && sequence <= run.lastSequence) {
                throw new StatusError('Completion sequence must follow all observed run events', 409)
            }
            if (event.type === 'started' && (run.startSequence !== null || sequence >= run.lastSequence && run.lastSequence >= 0)) {
                throw new StatusError('Start must precede the observed run events', 409)
            }
            const update: Partial<typeof statusRuns.$inferInsert> = {}
            if (event.type === 'started') {
                update.startedAt = occurredAt ?? now
                update.startSequence = sequence
                if (run.finishedAt !== null && update.startedAt > run.finishedAt) throw new StatusError('Start time follows completion')
            }
            const occurrence = scheduleIndex(job, event, now)
            if (occurrence !== null) {
                if (run.scheduleEpoch !== job.scheduleEpoch) throw new StatusError('Run belongs to a previous monitoring schedule', 409)
                if (run.scheduleIndex !== null && run.scheduleIndex !== occurrence) throw new StatusError('Run occurrence cannot change', 409)
                // Only an actual start (including a delayed start) fulfills a scheduled start.
                if (event.type === 'started') update.scheduleIndex = occurrence
            }
            if (sequence > run.lastSequence && run.terminalSequence === null) {
                update.lastSequence = sequence
                if (event.source !== undefined) update.source = event.source
                if (event.message !== undefined) update.message = event.message
                if (event.progress !== undefined) update.progress = event.progress
                if (event.metrics !== undefined) update.metrics = event.metrics
                if (event.rawStatus !== undefined) update.rawStatus = event.rawStatus
                if (event.type === 'heartbeat') {
                    if (occurredAt !== null && occurredAt < now - (job.heartbeatSeconds ?? 300) * 1000) {
                        throw new StatusError('Run heartbeat is too old to establish liveness', 410)
                    }
                    update.lastHeartbeatAt = now
                }
            }
            if (event.type === 'completed') {
                update.outcome = event.outcome
                update.finishedAt = occurredAt ?? now
                update.terminalSequence = sequence
                update.exitCode = event.exitCode ?? null
                if (run.startedAt !== null && update.finishedAt < run.startedAt) throw new StatusError('Completion time precedes start')
            }
            if (Object.keys(update).length) tx.update(statusRuns).set(update).where(eq(statusRuns.key, run.key)).run()
            tx.update(statusJobs).set({ lastSeenAt: now }).where(eq(statusJobs.id, job.id)).run()
        }
        tx.insert(statusEvents).values({
            jobId: job.id, eventId: event.eventId, runId: event.runId ?? null, sequence: event.sequence ?? null,
            type: event.type, receivedAt: now, occurredAt,
            clockSkewMs: occurredAt === null ? null : now - occurredAt,
            payloadHash, payload: event,
        }).run()
        return false
    })
}

export function summarizeStatusJob(database: StatusDatabase, job: Job, now = Date.now()): StatusJobSummary {
    const runs = database.select().from(statusRuns).where(eq(statusRuns.jobId, job.id)).all()
    const active = runs.filter(run => run.outcome === 'running')
    const completed = runs.filter(run => run.outcome !== 'running').sort((a, b) => runOrder(b) - runOrder(a) || b.firstReceivedAt - a.firstReceivedAt || b.key - a.key)
    const lastRun = completed[0] ?? null
    const successes = runs.filter(run => run.outcome === 'succeeded' && run.finishedAt !== null)
    const lastSuccessAt = successes.length ? Math.max(...successes.map(run => run.finishedAt!)) : null
    const conditions: StatusJobSummary['conditions'] = []
    let missedStarts = 0
    let nextExpectedAt: number | null = null
    if (job.mode === 'scheduled' && job.anchorAt !== null && job.intervalSeconds !== null) {
        const interval = job.intervalSeconds * 1000
        const dueIndex = Math.floor((now - job.anchorAt - job.graceSeconds * 1000) / interval)
        const matched = new Set(runs.filter(run =>
            run.scheduleEpoch === job.scheduleEpoch && run.scheduleIndex !== null && run.scheduleIndex <= dueIndex,
        ).map(run => run.scheduleIndex))
        missedStarts = Math.max(0, dueIndex + 1 - matched.size - job.retiredMatches)
        nextExpectedAt = job.anchorAt + Math.max(0, Math.floor((now - job.anchorAt) / interval) + 1) * interval
        if (missedStarts) conditions.push('late')
    }
    if (job.lastSeenAt === null) conditions.push('unknown')
    if (job.mode === 'heartbeat' && job.heartbeatSeconds !== null) {
        if (now > (job.lastServiceHeartbeatAt ?? job.createdAt) + job.heartbeatSeconds * 1000) conditions.push('stale')
        if (job.serviceHealth && job.serviceHealth !== 'healthy') conditions.push('reported_unhealthy')
        if (job.serviceHealth === null && !conditions.includes('unknown')) conditions.push('unknown')
    }
    if (job.heartbeatSeconds !== null && active.some(run =>
        now > (run.lastHeartbeatAt ?? run.firstReceivedAt) + job.heartbeatSeconds! * 1000,
    )) conditions.push('stale')
    if (job.maxRuntimeSeconds !== null && active.some(run =>
        now > (run.startedAt ?? run.firstReceivedAt) + job.maxRuntimeSeconds! * 1000,
    )) conditions.push('overdue')
    const paused = job.paused || job.archived
    const heartbeat = database.select().from(statusEvents).where(and(
        eq(statusEvents.jobId, job.id), eq(statusEvents.type, 'heartbeat'),
        sql`${statusEvents.runId} is null`,
    )).orderBy(desc(statusEvents.receivedAt), desc(statusEvents.key)).limit(1).get()
    const { tokenHash, scheduleEpoch, retiredMatches, lastServiceHeartbeatAt, ...publicJob } = job
    return {
        ...publicJob, conditions: paused ? ['paused'] : conditions,
        activeRuns: active.map(asRun), lastRun: lastRun ? asRun(lastRun) : null, lastSuccessAt,
        missedStarts, nextExpectedAt,
        needsAttention: !paused && (conditions.length > 0 || lastRun?.outcome === 'failed'),
        lastHeartbeat: heartbeat ? {
            eventId: heartbeat.eventId, runId: null, sequence: null, type: heartbeat.type,
            receivedAt: heartbeat.receivedAt, occurredAt: heartbeat.occurredAt,
            clockSkewMs: heartbeat.clockSkewMs, payload: heartbeat.payload,
        } : null,
    }
}

export function statusRunDetail(run: Run): StatusRun { return asRun(run) }

export function markStatusRunFailed(database: StatusDatabase, jobId: string, runId: string, reason: string, now = Date.now()): StatusRun {
    return database.transaction(tx => {
        const job = tx.select().from(statusJobs).where(eq(statusJobs.id, jobId)).get()
        if (!job) throw new StatusError('Unknown status job', 404)
        const run = tx.select().from(statusRuns).where(and(eq(statusRuns.jobId, jobId), eq(statusRuns.id, runId))).get()
        if (!run) throw new StatusError('Unknown run', 404)
        if (run.outcome !== 'running' || run.terminalSequence !== null) {
            throw new StatusError('Run is already finished; refresh its status', 409)
        }
        if (run.lastSequence >= Number.MAX_SAFE_INTEGER) throw new StatusError('Run sequence limit reached', 409)
        ingestStatusEvent(database, job, {
            eventId: crypto.randomUUID(),
            runId,
            sequence: run.lastSequence + 1,
            type: 'completed',
            outcome: 'failed',
            occurredAt: new Date(now).toISOString(),
            rawStatus: 'manually_failed',
            message: reason,
            metadata: { resolvedBy: 'admin', reason },
        }, now)
        // An administrator resolving history is not a producer liveness report.
        tx.update(statusJobs).set({ lastSeenAt: job.lastSeenAt }).where(eq(statusJobs.id, jobId)).run()
        const finished = tx.select().from(statusRuns).where(eq(statusRuns.key, run.key)).get()
        if (!finished) throw new Error('Resolved run could not be read')
        return asRun(finished)
    })
}

export function sweepStatusRetention(database: StatusDatabase, now = Date.now()): void {
    database.transaction(tx => {
        // Compact identity tombstones deliberately survive payload/run retention.
        for (const job of tx.select().from(statusJobs).all()) {
            const heartbeat = tx.select({ key: statusEvents.key }).from(statusEvents).where(and(
                eq(statusEvents.jobId, job.id), eq(statusEvents.type, 'heartbeat'), sql`${statusEvents.runId} is null`,
            )).orderBy(desc(statusEvents.receivedAt), desc(statusEvents.key)).limit(1).get()
            tx.update(statusEvents).set({ payload: null }).where(and(
                eq(statusEvents.jobId, job.id), lt(statusEvents.receivedAt, now - 30 * DAY), isNotNull(statusEvents.payload),
                heartbeat ? ne(statusEvents.key, heartbeat.key) : undefined,
            )).run()
            const runs = tx.select().from(statusRuns).where(eq(statusRuns.jobId, job.id)).all()
            const completed = runs.filter(run => run.outcome !== 'running').sort((a, b) => runOrder(b) - runOrder(a) || b.key - a.key)
            const last = completed[0]?.key
            const success = [...completed].filter(run => run.outcome === 'succeeded').sort((a, b) => (b.finishedAt ?? 0) - (a.finishedAt ?? 0))[0]?.key
            const retired = completed.filter(run => run.key !== last && run.key !== success && (run.finishedAt ?? run.firstReceivedAt) < now - 365 * DAY)
            const retiredKeys = new Set(retired.map(run => run.key))
            const retiredIndexes = new Set(retired.filter(run => run.scheduleEpoch === job.scheduleEpoch && run.scheduleIndex !== null).map(run => run.scheduleIndex))
            const survivingIndexes = new Set(runs.filter(run => !retiredKeys.has(run.key) && run.scheduleEpoch === job.scheduleEpoch).map(run => run.scheduleIndex))
            let matches = 0
            for (const index of retiredIndexes) if (!survivingIndexes.has(index)) matches++
            if (matches) tx.update(statusJobs).set({ retiredMatches: job.retiredMatches + matches }).where(eq(statusJobs.id, job.id)).run()
            for (const run of retired) tx.delete(statusRuns).where(eq(statusRuns.key, run.key)).run()
        }
    })
}
