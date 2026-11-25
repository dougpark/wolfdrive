import { ref } from 'vue'
import type { StatusEventRecord, StatusJobConfig, StatusJobPage, StatusPage, StatusRun } from '@/types/status'

const BASE = '/api/status/v1'
const TOKEN_STORAGE_KEY = 'wolfdrive-status-token'

export function useStatus() {
    const token = ref('')
    const page = ref<StatusJobPage | null>(null)
    const error = ref('')
    const actionError = ref('')
    const lastRefresh = ref<number | null>(null)
    const busy = ref(false)
    const storageError = ref('')
    let refreshVersion = 0

    try {
        token.value = localStorage.getItem(TOKEN_STORAGE_KEY) ?? ''
    } catch (err) {
        console.error('Unable to restore Status access token:', err)
        storageError.value = 'Browser storage is unavailable. Enter your Status token for this visit.'
    }

    async function request<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
        const response = await fetch(`${BASE}${path}`, {
            method,
            headers: { Authorization: `Bearer ${token.value}`, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
            ...(body === undefined ? {} : { body: JSON.stringify(body) }),
            signal: AbortSignal.timeout(10000),
            cache: 'no-store',
        })
        if (!response.ok) {
            const text = await response.text()
            let message = `Status request failed (${response.status})`
            try {
                const parsed: unknown = JSON.parse(text)
                if (parsed && typeof parsed === 'object' && 'error' in parsed && typeof parsed.error === 'string') message = parsed.error
            } catch (error) {
                if (!(error instanceof SyntaxError)) throw error
            }
            throw new Error(message)
        }
        return response.json() as Promise<T>
    }
    async function refresh(query: URLSearchParams) {
        if (!token.value) return
        const version = ++refreshVersion
        const currentToken = token.value
        try {
            const result = await request<StatusJobPage>(`/jobs?${query}`)
            if (currentToken !== token.value || version !== refreshVersion) return
            page.value = result
            lastRefresh.value = Date.now()
            error.value = ''
        } catch (err) {
            if (currentToken === token.value && version === refreshVersion) error.value = err instanceof Error ? err.message : 'Unable to refresh Status'
        }
    }
    async function action<T>(path: string, method: string, body?: unknown): Promise<T | undefined> {
        busy.value = true
        actionError.value = ''
        try {
            return await request<T>(path, method, body)
        } catch (err) {
            actionError.value = err instanceof Error ? err.message : 'Status operation failed'
        } finally {
            busy.value = false
        }
    }
    function saveJob(id: string, config: StatusJobConfig, editing: boolean) {
        return action<{ reportingToken?: string }>(`/jobs/${encodeURIComponent(id)}`, editing ? 'PUT' : 'POST', config)
    }
    function changeJob(id: string, values: { paused?: boolean; archived?: boolean }) {
        return action<{ updated: boolean }>(`/jobs/${encodeURIComponent(id)}`, 'PATCH', values)
    }
    function rotateToken(id: string) {
        return action<{ reportingToken: string }>(`/jobs/${encodeURIComponent(id)}/token`, 'POST')
    }
    function runs(id: string, offset = 0) {
        return request<StatusPage<StatusRun>>(`/jobs/${encodeURIComponent(id)}/runs?offset=${offset}&limit=20`)
    }
    function detail(id: string, runId: string, offset = 0) {
        return request<{ run: StatusRun; events: StatusPage<StatusEventRecord> }>(`/jobs/${encodeURIComponent(id)}/runs/${encodeURIComponent(runId)}?offset=${offset}&limit=50`)
    }
    function failRun(id: string, runId: string, reason: string) {
        return action<{ run: StatusRun }>(`/jobs/${encodeURIComponent(id)}/runs/${encodeURIComponent(runId)}/fail`, 'POST', { reason })
    }
    function dispose() {
        refreshVersion++
        token.value = ''
        page.value = null
        error.value = ''
        actionError.value = ''
        lastRefresh.value = null
    }
    function connect(value: string) {
        dispose()
        token.value = value.trim()
        storageError.value = ''
        try {
            localStorage.setItem(TOKEN_STORAGE_KEY, token.value)
        } catch (err) {
            console.error('Unable to save Status access token:', err)
            storageError.value = 'Could not save your Status token in this browser. It will only work for this visit.'
        }
    }
    function disconnect() {
        dispose()
        storageError.value = ''
        try {
            localStorage.removeItem(TOKEN_STORAGE_KEY)
        } catch (err) {
            console.error('Unable to remove saved Status access token:', err)
            storageError.value = "Could not remove the saved Status token. Clear this site's browser data to forget it."
        }
    }
    return { token, page, error, actionError, busy, storageError, lastRefresh, refresh, request, saveJob, changeJob, rotateToken, runs, detail, failRun, connect, disconnect, dispose }
}
