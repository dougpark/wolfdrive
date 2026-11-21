<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { Activity, CircleCheck, CirclePause, CircleX, Maximize, Minimize, WifiOff } from 'lucide-vue-next'
import BaseButton from '@/components/ui/BaseButton.vue'
import { useDashboard } from '@/composables/useDashboard'
import type { DashboardJob } from '@/types/status'

const route = useRoute()
const token = computed(() => typeof route.query.token === 'string' ? route.query.token.trim() : '')
const { data, error, loading, refresh, dispose } = useDashboard(token)
const attention = computed(() => data.value?.jobs.filter(job => job.needsAttention).length ?? 0)
const relative = new Intl.RelativeTimeFormat('en', { numeric: 'auto' })
const isFullscreen = ref(false)
const fullscreenBusy = ref(false)
const fullscreenError = ref('')
let timer: ReturnType<typeof setInterval>

function syncFullscreen() {
    isFullscreen.value = Boolean(document.fullscreenElement)
}
async function toggleFullscreen() {
    if (fullscreenBusy.value) return
    fullscreenBusy.value = true
    fullscreenError.value = ''
    try {
        if (document.fullscreenElement) {
            await document.exitFullscreen()
        } else {
            if (!document.fullscreenEnabled || typeof document.documentElement.requestFullscreen !== 'function') {
                throw new Error('Fullscreen is unavailable in this browser or page. Use browser kiosk mode instead.')
            }
            await document.documentElement.requestFullscreen()
        }
        syncFullscreen()
    } catch (err) {
        fullscreenError.value = err instanceof Error ? err.message : 'Unable to change fullscreen mode.'
    } finally {
        fullscreenBusy.value = false
    }
}

function ago(time: number): string {
    const seconds = (time - (data.value?.evaluatedAt ?? Date.now())) / 1000
    for (const [unit, size] of [['day', 86400], ['hour', 3600], ['minute', 60]] as const) {
        if (Math.abs(seconds) >= size) return relative.format(Math.round(seconds / size), unit)
    }
    return relative.format(Math.round(seconds), 'second')
}
function description(job: DashboardJob): string {
    const parts: string[] = []
    if (job.mode === 'heartbeat') {
        parts.push(job.serviceHealth ? `Service ${job.serviceHealth}` : 'Service health unknown')
        if (job.lastSeenAt !== null) parts.push(`Seen ${ago(job.lastSeenAt)}`)
    } else if (job.lastRunAt !== null && job.lastOutcome !== null) {
        parts.push(`Last run ${ago(job.lastRunAt)}`, job.lastOutcome)
    } else {
        parts.push(job.activeRunCount ? 'First run in progress' : 'No completed runs')
    }
    if (job.activeRunCount) {
        parts.push(job.activeRunCount === 1 ? 'Running' : `${job.activeRunCount} running`)
        if (job.lastRunAt === null && job.activeRunStartedAt !== null) parts.push(`Started ${ago(job.activeRunStartedAt)}`)
    }
    for (const condition of job.conditions) parts.push(condition.replaceAll('_', ' '))
    return parts.join(' · ')
}
function visibility() { if (!document.hidden) void refresh() }
watch(token, () => { void refresh() })
onMounted(() => {
    syncFullscreen()
    document.addEventListener('fullscreenchange', syncFullscreen)
    void refresh()
    timer = setInterval(() => { if (!document.hidden) void refresh() }, 30000)
    document.addEventListener('visibilitychange', visibility)
})
onBeforeUnmount(() => {
    clearInterval(timer)
    document.removeEventListener('visibilitychange', visibility)
    document.removeEventListener('fullscreenchange', syncFullscreen)
    dispose()
})
</script>

<template>
    <main class="h-screen w-full space-y-8 overflow-y-auto bg-gemini-bg p-8 text-gemini-text">
        <header class="flex flex-wrap items-center justify-between gap-4">
            <div class="flex items-center gap-3">
                <Activity class="h-8 w-8 text-gemini-blue" />
                <h1 class="text-3xl font-medium tracking-tight">WolfDrive dashboard</h1>
            </div>
            <div class="flex items-center gap-4">
                <p class="text-sm text-gemini-subtext">Updates every 30 seconds</p>
                <BaseButton
                    :aria-label="isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'"
                    :title="isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'"
                    :aria-pressed="isFullscreen"
                    :disabled="fullscreenBusy"
                    @click="toggleFullscreen"
                >
                    <Minimize v-if="isFullscreen" class="h-5 w-5" aria-hidden="true" />
                    <Maximize v-else class="h-5 w-5" aria-hidden="true" />
                </BaseButton>
            </div>
        </header>
        <p v-if="fullscreenError" role="alert" class="text-sm text-gemini-purple">{{ fullscreenError }}</p>

        <section aria-labelledby="dashboard-jobs-title" class="w-full rounded-3xl border border-gemini-border bg-gemini-card p-6 shadow-sm">
            <header class="mb-4 flex flex-wrap items-center justify-between gap-3">
                <h2 id="dashboard-jobs-title" class="text-2xl font-medium tracking-tight">Job status</h2>
                <p v-if="data && !error" class="text-lg" :class="attention ? 'text-red-600' : 'text-gemini-subtext'">
                    {{ data.jobs.length }} jobs · {{ attention }} need attention
                </p>
            </header>
            <div v-if="error" role="alert" class="mb-4 flex items-center gap-3 rounded-xl border border-red-600 bg-gemini-surface p-4 text-red-600">
                <WifiOff class="h-8 w-8 shrink-0" />
                <div><p class="text-xl font-medium">Dashboard unavailable{{ data ? ' — displayed data is stale' : '' }}</p><p class="text-base leading-relaxed">{{ error }}</p></div>
            </div>
            <p v-if="!data && !error" class="py-8 text-xl text-gemini-subtext">Loading job status...</p>
            <p v-else-if="data && !data.jobs.length" class="py-8 text-xl text-gemini-subtext">No jobs tagged "dashboard". Add the dashboard tag in Homelab Status to display a job here.</p>
            <ul v-if="data?.jobs.length" class="divide-y divide-gemini-border" :class="{ 'opacity-50': error }">
                <li v-for="job in data.jobs" :key="job.id" class="grid grid-cols-12 items-center gap-4 py-5">
                    <div class="col-span-1 flex justify-center">
                        <CircleX v-if="error || job.needsAttention" class="h-8 w-8 text-red-600 sm:h-10 sm:w-10" :aria-label="error ? 'Stale data' : 'Needs attention'" role="img" />
                        <CirclePause v-else-if="job.conditions.includes('paused')" class="h-8 w-8 text-gemini-subtext sm:h-10 sm:w-10" aria-label="Paused" role="img" />
                        <CircleCheck v-else class="h-8 w-8 text-green-600 sm:h-10 sm:w-10" aria-label="OK" role="img" />
                    </div>
                    <h3 class="col-span-4 truncate text-lg font-medium tracking-tight sm:text-2xl" :title="job.name">{{ job.name }}</h3>
                    <p class="col-span-7 truncate text-base leading-relaxed text-gemini-subtext sm:text-xl" :title="description(job)">{{ description(job) }}</p>
                </li>
            </ul>
            <p class="mt-4 text-sm text-gemini-subtext">
                {{ loading ? 'Updating...' : 'Last successful update:' }}
                <template v-if="data">{{ new Date(data.evaluatedAt).toLocaleString() }}</template>
                <template v-else>Not yet available</template>
            </p>
        </section>
    </main>
</template>
