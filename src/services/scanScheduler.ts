import { eq } from 'drizzle-orm'
import type { db } from '../db'
import { appSettings } from '../db/schema'

export interface ScanSchedule {
    intervalSeconds: number | null
    nextRunAt: string | null
    lastRunAt: string | null
    lastError: string | null
}

const KEY = 'scan_schedule'
const EMPTY: ScanSchedule = { intervalSeconds: null, nextRunAt: null, lastRunAt: null, lastError: null }

export function createScanScheduler(database: typeof db, scanAll: () => Promise<unknown>, now = () => Date.now()) {
    let running = false

    function getSchedule(): ScanSchedule {
        const row = database.select().from(appSettings).where(eq(appSettings.key, KEY)).get()
        if (!row) return { ...EMPTY }
        const value: unknown = JSON.parse(row.value)
        if (!value || typeof value !== 'object') throw new Error('Invalid stored scan schedule')
        const data = value as Record<string, unknown>
        if ((data.intervalSeconds !== null && (typeof data.intervalSeconds !== 'number' || !Number.isSafeInteger(data.intervalSeconds) || data.intervalSeconds < 60 || data.intervalSeconds > 31536000))
            || (data.nextRunAt !== null && (typeof data.nextRunAt !== 'string' || !Number.isFinite(Date.parse(data.nextRunAt))))
            || (data.lastRunAt !== null && (typeof data.lastRunAt !== 'string' || !Number.isFinite(Date.parse(data.lastRunAt))))
            || (data.lastError !== null && typeof data.lastError !== 'string')
            || ((data.intervalSeconds === null) !== (data.nextRunAt === null))) {
            throw new Error('Invalid stored scan schedule')
        }
        return {
            intervalSeconds: data.intervalSeconds as number | null,
            nextRunAt: data.nextRunAt as string | null,
            lastRunAt: data.lastRunAt as string | null,
            lastError: data.lastError as string | null,
        }
    }

    function save(schedule: ScanSchedule) {
        database.insert(appSettings).values({ key: KEY, value: JSON.stringify(schedule) })
            .onConflictDoUpdate({ target: appSettings.key, set: { value: JSON.stringify(schedule), updatedAt: new Date(now()).toISOString() } }).run()
    }

    function configure(intervalSeconds: number | null) {
        if (intervalSeconds !== null && (!Number.isSafeInteger(intervalSeconds) || intervalSeconds < 60 || intervalSeconds > 31536000)) {
            throw new RangeError('Interval must be between 60 and 31536000 seconds')
        }
        const current = getSchedule()
        const nextRunAt = intervalSeconds === null ? null : new Date(now() + intervalSeconds * 1000).toISOString()
        const updated = { ...current, intervalSeconds, nextRunAt }
        save(updated)
        return updated
    }

    async function run<T>(scan: () => Promise<T>): Promise<{ started: false } | { started: true; result: T }> {
        if (running) return { started: false }
        running = true
        try {
            return { started: true, result: await scan() }
        } finally {
            running = false
        }
    }

    async function tick() {
        const schedule = getSchedule()
        if (!schedule.nextRunAt || Date.parse(schedule.nextRunAt) > now() || running) return
        let errorMessage: string | null = null
        try {
            await run(scanAll)
        } catch (error) {
            console.error('Scheduled scan failed:', error)
            errorMessage = error instanceof Error ? error.message : String(error)
        }
        const current = getSchedule()
        if (current.nextRunAt !== schedule.nextRunAt || current.intervalSeconds !== schedule.intervalSeconds) return
        const finishedAt = now()
        save({
            ...current,
            nextRunAt: new Date(finishedAt + current.intervalSeconds! * 1000).toISOString(),
            lastRunAt: new Date(finishedAt).toISOString(),
            lastError: errorMessage,
        })
    }

    return { getSchedule, configure, run, tick }
}
