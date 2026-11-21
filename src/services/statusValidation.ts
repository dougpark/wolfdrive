import type { StatusEventInput, StatusJobConfig } from '../types/status'

export class StatusError extends Error {
    constructor(message: string, public status: 400 | 401 | 403 | 404 | 409 | 410 | 413 | 429 | 503 = 400) {
        super(message)
    }
}

export const MAX_EVENT_BYTES = 64 * 1024
export const MAX_DELIVERY_AGE_MS = 24 * 60 * 60 * 1000
export const MAX_CLOCK_SKEW_MS = 5 * 60 * 1000
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function record(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function assert(condition: unknown, message: string): asserts condition {
    if (!condition) throw new StatusError(message)
}

function string(value: unknown, name: string, max = 1024): asserts value is string {
    assert(typeof value === 'string' && value.length <= max, `${name} must be a string of at most ${max} characters`)
}

function integer(value: unknown, name: string, min = 0, max = Number.MAX_SAFE_INTEGER): asserts value is number {
    assert(typeof value === 'number' && Number.isSafeInteger(value) && value >= min && value <= max, `${name} must be an integer between ${min} and ${max}`)
}

function finite(value: unknown, name: string, min = -Number.MAX_VALUE): asserts value is number {
    assert(typeof value === 'number' && Number.isFinite(value) && value >= min, `${name} must be a finite number${min === 0 ? ' >= 0' : ''}`)
}

export function timestamp(value: unknown, name: string): number {
    string(value, name, 40)
    const parts = /^(\d{4})-(\d\d)-(\d\d)T(\d\d):(\d\d):(\d\d)(?:\.\d{1,3})?(?:Z|[+-]\d\d:\d\d)$/.exec(value)
    assert(parts, `${name} must be an ISO 8601 timestamp with timezone`)
    const year = Number(parts[1]), month = Number(parts[2]), day = Number(parts[3])
    const endOfMonth = new Date(0)
    endOfMonth.setUTCFullYear(year, month, 0)
    assert(month >= 1 && month <= 12 && day >= 1 && day <= endOfMonth.getUTCDate() &&
        Number(parts[4]) <= 23 && Number(parts[5]) <= 59 && Number(parts[6]) <= 59, `${name} has an invalid date or time`)
    const time = Date.parse(value)
    assert(Number.isFinite(time), `${name} is not a valid timestamp`)
    return time
}

function boundedJson(value: unknown, depth = 0, budget = { fields: 0 }): void {
    assert(depth <= 8, 'JSON nesting exceeds 8 levels')
    if (typeof value === 'string') string(value, 'JSON value', 4096)
    if (typeof value === 'number') finite(value, 'JSON value')
    if (value && typeof value === 'object') {
        for (const [key, child] of Object.entries(value)) {
            string(key, 'JSON key', 128)
            assert(++budget.fields <= 512, 'JSON contains too many fields')
            boundedJson(child, depth + 1, budget)
        }
    }
}

function checkEvent(value: unknown): asserts value is StatusEventInput {
    assert(record(value), 'Event must be an object')
    const allowed = new Set(['eventId', 'runId', 'sequence', 'type', 'occurredAt', 'scheduledFor', 'source', 'message', 'log', 'severity', 'outcome', 'exitCode', 'rawStatus', 'health', 'progress', 'metrics', 'metadata'])
    assert(Object.keys(value).every(key => allowed.has(key)), 'Unknown event field; place custom fields in metadata')
    assert(typeof value.eventId === 'string' && uuid.test(value.eventId), 'eventId must be a UUID')
    assert(['started', 'progress', 'log', 'heartbeat', 'completed'].includes(String(value.type)), 'Invalid event type')
    if (value.runId !== undefined) {
        assert(typeof value.runId === 'string' && uuid.test(value.runId), 'runId must be a UUID')
        integer(value.sequence, 'sequence')
    } else {
        assert(value.type === 'heartbeat', 'runId is required for run events')
        assert(value.sequence === undefined, 'Service heartbeats cannot have a run sequence')
    }
    for (const key of ['occurredAt', 'scheduledFor']) {
        if (value[key] !== undefined) timestamp(value[key], key)
    }
    assert(value.scheduledFor === undefined || value.runId !== undefined, 'scheduledFor requires runId')
    for (const key of ['source', 'rawStatus']) {
        if (value[key] !== undefined) string(value[key], key, 256)
    }
    if (value.message !== undefined) string(value.message, 'message', 4096)
    if (value.log !== undefined) {
        string(value.log, 'log', 16384)
        assert(Buffer.byteLength(value.log) <= 16384, 'log exceeds 16 KiB')
    }
    if (value.type === 'log') assert(value.log !== undefined, 'log event requires log text')
    if (value.severity !== undefined) assert(['debug', 'info', 'warning', 'error'].includes(String(value.severity)), 'Invalid severity')
    if (value.type === 'completed') assert(['succeeded', 'failed', 'cancelled', 'skipped'].includes(String(value.outcome)), 'completed requires a terminal outcome')
    else assert(value.outcome === undefined && value.exitCode === undefined, 'outcome and exitCode require completed')
    if (value.exitCode !== undefined) integer(value.exitCode, 'exitCode', -2147483648, 2147483647)
    if (value.health !== undefined) {
        assert(value.type === 'heartbeat' && value.runId === undefined, 'health is for service heartbeats')
        assert(['healthy', 'degraded', 'unhealthy'].includes(String(value.health)), 'Invalid service health')
    }
    if (value.progress !== undefined) {
        assert(record(value.progress), 'progress must be an object')
        assert(Object.keys(value.progress).every(key => ['current', 'total', 'unit'].includes(key)), 'Unknown progress field')
        finite(value.progress.current, 'progress.current', 0)
        if (value.progress.total !== undefined) {
            finite(value.progress.total, 'progress.total', 0)
            assert(value.progress.total > 0 && value.progress.total >= value.progress.current, 'total must be positive and >= current')
        }
        if (value.progress.unit !== undefined) string(value.progress.unit, 'progress.unit', 64)
    }
    if (value.metrics !== undefined) {
        assert(record(value.metrics), 'metrics must be an object')
        for (const [key, metric] of Object.entries(value.metrics)) {
            string(key, 'metric name', 128)
            assert(record(metric), 'metric must contain value and optional unit')
            assert(Object.keys(metric).every(field => ['value', 'unit'].includes(field)), 'Unknown metric field')
            finite(metric.value, 'metric.value')
            if (metric.unit !== undefined) string(metric.unit, 'metric.unit', 64)
        }
    }
    if (value.metadata !== undefined) assert(record(value.metadata), 'metadata must be an object')
    const extra = { metadata: value.metadata, metrics: value.metrics }
    boundedJson(extra)
    assert(Buffer.byteLength(JSON.stringify(extra)) <= 16384, 'metadata and metrics exceed 16 KiB')
}

export function validateEvent(value: unknown): StatusEventInput {
    checkEvent(value)
    return value
}

export function validateJobId(id: string): string {
    assert(/^[a-z0-9][a-z0-9_-]{0,79}$/.test(id), 'Job ID must use 1-80 lowercase letters, digits, underscores or hyphens')
    return id
}

export function validateJobConfig(value: unknown): StatusJobConfig {
    assert(record(value), 'Job configuration must be an object')
    assert(Object.keys(value).every(key => ['name', 'description', 'tags', 'mode', 'intervalSeconds', 'anchorAt', 'graceSeconds', 'maxRuntimeSeconds', 'heartbeatSeconds'].includes(key)), 'Unknown job configuration field')
    string(value.name, 'name', 120)
    assert(value.name.trim(), 'name is required')
    string(value.description ?? '', 'description', 2048)
    const mode = value.mode
    assert(mode === 'manual' || mode === 'scheduled' || mode === 'heartbeat', 'Invalid monitoring mode')
    const tags = value.tags ?? []
    assert(Array.isArray(tags) && tags.length <= 20, 'tags must be an array with at most 20 entries')
    for (const tag of tags) string(tag, 'tag', 64)
    const interval = value.intervalSeconds ?? null
    const anchor = value.anchorAt ?? null
    const heartbeat = value.heartbeatSeconds ?? null
    const runtime = value.maxRuntimeSeconds ?? null
    const grace = value.graceSeconds ?? 300
    integer(grace, 'graceSeconds', 0, 31536000)
    if (runtime !== null) integer(runtime, 'maxRuntimeSeconds', 1, 31536000)
    if (heartbeat !== null) integer(heartbeat, 'heartbeatSeconds', 1, 31536000)
    if (interval !== null) integer(interval, 'intervalSeconds', 1, 31536000)
    if (anchor !== null) integer(anchor, 'anchorAt', 0, 8640000000000000)
    if (mode === 'scheduled') {
        integer(interval, 'intervalSeconds', 1, 31536000)
        integer(anchor, 'anchorAt', 0, 8640000000000000)
    } else assert(interval === null && anchor === null, 'Only scheduled jobs can have intervalSeconds and anchorAt')
    if (mode === 'heartbeat') assert(heartbeat !== null, 'Heartbeat mode requires heartbeatSeconds')
    return {
        name: value.name.trim(),
        description: String(value.description ?? ''),
        tags: [...new Set(tags)],
        mode,
        intervalSeconds: interval,
        anchorAt: anchor,
        graceSeconds: grace,
        maxRuntimeSeconds: runtime,
        heartbeatSeconds: heartbeat,
    }
}
