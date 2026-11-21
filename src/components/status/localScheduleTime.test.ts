import { afterEach, beforeEach, expect, test } from 'bun:test'
import { formatLocalScheduleTime, parseLocalScheduleTime } from './localScheduleTime'

const originalTimezone = process.env.TZ
beforeEach(() => { process.env.TZ = 'America/Chicago' })
afterEach(() => {
    if (originalTimezone === undefined) delete process.env.TZ
    else process.env.TZ = originalTimezone
})

test('interprets 2 AM as local time rather than 2 AM UTC', () => {
    const timestamp = parseLocalScheduleTime('2026-11-22T02:00')
    expect(timestamp).toBe(Date.parse('2026-11-22T08:00:00Z'))
    expect(formatLocalScheduleTime(timestamp)).toBe('2026-11-22T02:00')
})

test('uses the selected date offset rather than a fixed winter offset', () => {
    expect(parseLocalScheduleTime('2026-07-22T02:00')).toBe(Date.parse('2026-07-22T07:00:00Z'))
})

test('preserves an unchanged existing anchor including seconds and milliseconds', () => {
    const original = Date.parse('2026-11-22T08:00:37.123Z')
    expect(parseLocalScheduleTime(formatLocalScheduleTime(original), original)).toBe(original)
    expect(parseLocalScheduleTime('2026-11-22T03:00', original)).toBe(Date.parse('2026-11-22T09:00:00Z'))
})

test('rejects invalid dates and nonexistent daylight-saving local times instead of normalizing them', () => {
    for (const value of ['', '2026-11-22T02:00Z', '2026-02-30T02:00', '2026-03-08T02:30']) {
        expect(() => parseLocalScheduleTime(value)).toThrow()
    }
})

test('preserves an existing anchor in the second occurrence of a repeated local hour', () => {
    const original = Date.parse('2026-11-01T07:30:45.123Z')
    expect(formatLocalScheduleTime(original)).toBe('2026-11-01T01:30')
    expect(parseLocalScheduleTime('2026-11-01T01:30', original)).toBe(original)
})
