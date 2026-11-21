import { afterEach, beforeEach, expect, spyOn, test } from 'bun:test'
import { ref } from 'vue'
import { useDashboard } from './useDashboard'

let fetchMock: ReturnType<typeof spyOn<typeof globalThis, 'fetch'>>
beforeEach(() => {
    fetchMock = spyOn(globalThis, 'fetch').mockResolvedValue(Response.json({ evaluatedAt: 123, jobs: [] }))
})
afterEach(() => fetchMock.mockRestore())

test('uses the URL credential as a bearer header without sending it in API URLs or referrers', async () => {
    const dashboard = useDashboard(ref('test-dashboard-token'))
    await dashboard.refresh()
    const call = fetchMock.mock.calls[0]!
    expect(call[0]).toBe('/api/status/v1/dashboard')
    expect(new Headers(call[1]?.headers).get('Authorization')).toBe('Bearer test-dashboard-token')
    expect(call[1]?.referrerPolicy).toBe('no-referrer')
    expect(call[1]?.credentials).toBe('omit')
    expect(dashboard.data.value).toEqual({ evaluatedAt: 123, jobs: [] })
})

test('missing tokens show link instructions without prompting for keyboard input or fetching', async () => {
    const dashboard = useDashboard(ref(''))
    await dashboard.refresh()
    expect(fetchMock).not.toHaveBeenCalled()
    expect(dashboard.error.value).toContain('/dashboard?token=')
})

test('failed refreshes keep the last snapshot visibly stale and recover on a later refresh', async () => {
    const dashboard = useDashboard(ref('test-dashboard-token'))
    await dashboard.refresh()
    fetchMock.mockRejectedValueOnce(new Error('Network unavailable'))
    await dashboard.refresh()
    expect(dashboard.data.value?.evaluatedAt).toBe(123)
    expect(dashboard.error.value).toBe('Network unavailable')
    fetchMock.mockResolvedValueOnce(Response.json({ evaluatedAt: 456, jobs: [] }))
    await dashboard.refresh()
    expect(dashboard.error.value).toBe('')
    expect(dashboard.data.value?.evaluatedAt).toBe(456)
})

test('authorization errors are shown instead of a healthy empty dashboard', async () => {
    fetchMock.mockResolvedValueOnce(Response.json({ error: 'Invalid dashboard read token' }, { status: 401 }))
    const dashboard = useDashboard(ref('wrong-token'))
    await dashboard.refresh()
    expect(dashboard.error.value).toBe('Invalid dashboard read token')
    expect(dashboard.data.value).toBeNull()
})

test('disposing the view cancels in-flight requests and prevents stale responses from returning', async () => {
    let complete: ((response: Response) => void) | undefined
    fetchMock.mockReturnValueOnce(new Promise<Response>(resolve => { complete = resolve }))
    const dashboard = useDashboard(ref('test-dashboard-token'))
    const pending = dashboard.refresh()
    dashboard.dispose()
    expect(fetchMock.mock.calls[0]?.[1]?.signal?.aborted).toBe(true)
    if (!complete) throw new Error('Request was not started')
    complete(Response.json({ evaluatedAt: 123, jobs: [] }))
    await pending
    expect(dashboard.data.value).toBeNull()
})
