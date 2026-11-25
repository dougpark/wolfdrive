import { afterEach, beforeEach, expect, spyOn, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import { migrate } from 'drizzle-orm/bun-sqlite/migrator'
import * as schema from '../db/schema'
import { createScanScheduler } from './scanScheduler'

let sqlite: Database
let database: ReturnType<typeof drizzle<typeof schema>>
let time: number

beforeEach(() => {
    sqlite = new Database(':memory:')
    database = drizzle(sqlite, { schema })
    migrate(database, { migrationsFolder: new URL('../../drizzle', import.meta.url).pathname })
    time = Date.parse('2026-01-01T00:00:00Z')
})
afterEach(() => sqlite.close())

test('persists schedule and runs missed scan after restart, then schedules from completion', async () => {
    let runs = 0
    const scan = async () => { runs++; time += 5000 }
    const first = createScanScheduler(database, scan, () => time)
    expect(first.getSchedule().intervalSeconds).toBeNull()
    expect(() => first.configure(59)).toThrow()
    expect(() => first.configure(1.5)).toThrow()
    first.configure(3600)
    time += 3600001
    const restarted = createScanScheduler(database, scan, () => time)
    await restarted.tick()
    expect(runs).toBe(1)
    expect(restarted.getSchedule().nextRunAt).toBe(new Date(time + 3600000).toISOString())
    await restarted.tick()
    expect(runs).toBe(1)
    restarted.configure(null)
    time += 7200000
    await restarted.tick()
    expect(runs).toBe(1)
})

test('does not overlap manual and scheduled scans, and preserves changes made during a run', async () => {
    let finish!: () => void
    let runs = 0
    const scan = () => { runs++; return new Promise<void>((resolve) => { finish = resolve }) }
    const scheduler = createScanScheduler(database, scan, () => time)
    scheduler.configure(60)
    time += 60000
    const pending = scheduler.tick()
    expect(await scheduler.run(async () => 1)).toEqual({ started: false })
    await scheduler.tick()
    expect(runs).toBe(1)
    scheduler.configure(null)
    finish()
    await pending
    expect(scheduler.getSchedule().intervalSeconds).toBeNull()
    expect(scheduler.getSchedule().nextRunAt).toBeNull()
})

test('records scan failures and schedules a retry', async () => {
    const log = spyOn(console, 'error').mockImplementation(() => {})
    try {
        const scheduler = createScanScheduler(database, async () => { throw new Error('disk unavailable') }, () => time)
        scheduler.configure(60)
        time += 60000
        await scheduler.tick()
        expect(scheduler.getSchedule().lastError).toBe('disk unavailable')
        expect(scheduler.getSchedule().nextRunAt).toBe(new Date(time + 60000).toISOString())
    } finally {
        log.mockRestore()
    }
})
