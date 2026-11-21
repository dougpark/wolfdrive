import { ref } from 'vue'
import type { Ref } from 'vue'
import type { DashboardSummary } from '@/types/status'

export function useDashboard(token: Ref<string>) {
    const data = ref<DashboardSummary | null>(null)
    const error = ref('')
    const loading = ref(false)
    let version = 0
    let controller: AbortController | null = null

    async function refresh() {
        const currentVersion = ++version
        controller?.abort()
        if (!token.value) {
            data.value = null
            error.value = 'Open the configured dashboard link: /dashboard?token=YOUR_DASHBOARD_TOKEN'
            loading.value = false
            return
        }
        const request = new AbortController()
        controller = request
        const timeout = setTimeout(() => request.abort(), 10000)
        loading.value = true
        try {
            const response = await fetch('/api/status/v1/dashboard', {
                headers: { Authorization: `Bearer ${token.value}` },
                credentials: 'omit',
                cache: 'no-store',
                referrerPolicy: 'no-referrer',
                signal: request.signal,
            })
            if (!response.ok) {
                const body: { error?: string } = await response.json()
                throw new Error(body.error ?? `Dashboard request failed (${response.status})`)
            }
            const summary: DashboardSummary = await response.json()
            if (currentVersion !== version) return
            data.value = summary
            error.value = ''
        } catch (err) {
            if (currentVersion !== version) return
            error.value = err instanceof Error ? err.message : 'Unable to refresh the dashboard'
        } finally {
            clearTimeout(timeout)
            if (currentVersion === version) {
                loading.value = false
                controller = null
            }
        }
    }
    function dispose() {
        version++
        controller?.abort()
        controller = null
    }
    return { data, error, loading, refresh, dispose }
}
