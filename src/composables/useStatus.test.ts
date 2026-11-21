import { afterEach, beforeEach, expect, spyOn, test } from 'bun:test'
import { useStatus } from './useStatus'

const originalStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
let storage: Storage
let fetchMock: ReturnType<typeof spyOn<typeof globalThis, 'fetch'>>
let logMock: ReturnType<typeof spyOn<typeof console, 'error'>>

beforeEach(() => {
    const values = new Map<string, string>()
    storage = {
        get length() { return values.size },
        clear() { values.clear() },
        getItem(key) { return values.get(key) ?? null },
        key(index) { return [...values.keys()][index] ?? null },
        removeItem(key) { values.delete(key) },
        setItem(key, value) { values.set(key, value) },
    }
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: storage })
    fetchMock = spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ items: [], total: 0 })))
    logMock = spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => {
    fetchMock.mockRestore()
    logMock.mockRestore()
    if (originalStorage) Object.defineProperty(globalThis, 'localStorage', originalStorage)
    else Reflect.deleteProperty(globalThis, 'localStorage')
})

test('restores saved access after navigation or reload and uses it for requests', async () => {
    const firstVisit = useStatus()
    firstVisit.connect('  test-status-access  ')
    firstVisit.dispose()
    expect(firstVisit.token.value).toBe('')
    const nextVisit = useStatus()
    expect(nextVisit.token.value).toBe('test-status-access')
    await nextVisit.refresh(new URLSearchParams())
    expect(new Headers(fetchMock.mock.calls[0]?.[1]?.headers).get('Authorization')).toBe('Bearer test-status-access')
    expect(nextVisit.page.value?.items).toEqual([])
})

test('Lock forgets saved access without removing unrelated browser preferences', () => {
    storage.setItem('wolfdrive-theme', 'dark')
    const status = useStatus()
    status.connect('test-status-access')
    status.disconnect()
    expect(useStatus().token.value).toBe('')
    expect(storage.getItem('wolfdrive-theme')).toBe('dark')
})

test('warns explicitly when browser storage cannot restore, save, or forget the token', () => {
    storage.getItem = () => { throw new Error('Storage blocked') }
    const status = useStatus()
    expect(status.storageError.value).toContain('unavailable')
    storage.setItem = () => { throw new Error('Storage blocked') }
    status.connect('test-status-access')
    expect(status.token.value).toBe('test-status-access')
    expect(status.storageError.value).toContain('Could not save')
    storage.removeItem = () => { throw new Error('Storage blocked') }
    status.disconnect()
    expect(status.token.value).toBe('')
    expect(status.storageError.value).toContain('Could not remove')
    expect(logMock).toHaveBeenCalledTimes(3)
})

test('leaving the page invalidates an in-flight refresh without forgetting saved access', async () => {
    let complete: ((response: Response) => void) | undefined
    fetchMock.mockReturnValue(new Promise<Response>(resolve => { complete = resolve }))
    const status = useStatus()
    status.connect('test-status-access')
    const refresh = status.refresh(new URLSearchParams())
    status.dispose()
    if (!complete) throw new Error('Request not started')
    complete(new Response(JSON.stringify({ items: [], total: 0 })))
    await refresh
    expect(status.page.value).toBeNull()
    expect(useStatus().token.value).toBe('test-status-access')
})
