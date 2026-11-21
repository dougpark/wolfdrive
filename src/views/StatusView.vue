<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { Activity, AlertTriangle, RefreshCw, Plus } from 'lucide-vue-next'
import BaseButton from '@/components/ui/BaseButton.vue'
import BaseInput from '@/components/ui/BaseInput.vue'
import ModalShell from '@/components/ModalShell.vue'
import StatusJobEditor from '@/components/status/StatusJobEditor.vue'
import { useStatus } from '@/composables/useStatus'
import type { StatusEventRecord, StatusJobConfig, StatusJobSummary, StatusPage, StatusRun } from '@/types/status'

const status = useStatus()
const { token, page, error, actionError, busy, storageError, lastRefresh } = status
const tokenInput = ref('')
const search = ref('')
const filter = ref('')
const mode = ref('')
const archived = ref(false)
const offset = ref(0)
const showEditor = ref(false)
const editingJob = ref<StatusJobSummary | null>(null)
const reportingToken = ref('')
const reportingJobId = ref('')
const selectedJob = ref<StatusJobSummary | null>(null)
const runPage = ref<StatusPage<StatusRun> | null>(null)
const selectedRun = ref<StatusRun | null>(null)
const events = ref<StatusPage<StatusEventRecord> | null>(null)
const detailError = ref('')
const detailBusy = ref(false)
const confirmRotate = ref(false)
let timer: ReturnType<typeof setInterval>
let debounce: ReturnType<typeof setTimeout>
let detailVersion = 0

const jobs = computed(() => page.value?.items ?? [])
const attention = computed(() => jobs.value.filter(job => job.needsAttention).length)
const unknown = computed(() => jobs.value.filter(job => job.conditions.includes('unknown')).length)
const active = computed(() => jobs.value.reduce((count, job) => count + job.activeRuns.length, 0))
const paused = computed(() => jobs.value.filter(job => job.conditions.includes('paused')).length)
function date(time: number | null | undefined) { return time === null || time === undefined ? 'Unknown' : new Date(time).toLocaleString() }
function duration(run: StatusRun) { return run.durationMs === null || run.durationMs === undefined ? 'Unknown duration' : `${Math.round(run.durationMs / 1000)}s` }
function conditionText(job: StatusJobSummary) {
    if (job.conditions.length) return job.conditions.map(value => value.replaceAll('_', ' ')).join(', ')
    if (job.lastRun?.outcome === 'failed') return 'Last run failed'
    return job.activeRuns.length ? 'Running' : 'On track'
}
async function refresh() {
    await status.refresh(new URLSearchParams({
        search: search.value, condition: filter.value, mode: mode.value,
        archived: String(archived.value), offset: String(offset.value), limit: '50',
    }))
}
async function connect() {
    status.connect(tokenInput.value)
    tokenInput.value = ''
    offset.value = 0
    await refresh()
}
function disconnect() {
    detailVersion++
    selectedJob.value = null
    showEditor.value = false
    reportingToken.value = ''
    status.disconnect()
}
function edit(job: StatusJobSummary | null) {
    editingJob.value = job
    actionError.value = ''
    showEditor.value = true
}
async function save(id: string, config: StatusJobConfig) {
    const result = await status.saveJob(id, config, !!editingJob.value)
    if (!result) return
    showEditor.value = false
    if (result.reportingToken) {
        reportingToken.value = result.reportingToken
        reportingJobId.value = id
    }
    await refresh()
}
async function change(job: StatusJobSummary, values: { paused?: boolean; archived?: boolean }) {
    if (await status.changeJob(job.id, values)) {
        selectedJob.value = null
        await refresh()
    }
}
async function rotate(job: StatusJobSummary) {
    if (!confirmRotate.value) { confirmRotate.value = true; return }
    const result = await status.rotateToken(job.id)
    if (result) {
        selectedJob.value = null
        reportingToken.value = result.reportingToken
        reportingJobId.value = job.id
    }
    confirmRotate.value = false
}
async function loadRuns(job: StatusJobSummary, at = 0) {
    const version = ++detailVersion
    selectedJob.value = job
    selectedRun.value = null
    events.value = null
    runPage.value = null
    detailError.value = ''
    detailBusy.value = true
    confirmRotate.value = false
    try {
        const result = await status.runs(job.id, at)
        if (version === detailVersion) runPage.value = result
    } catch (err) {
        if (version === detailVersion) detailError.value = err instanceof Error ? err.message : 'Unable to fetch runs'
    } finally { if (version === detailVersion) detailBusy.value = false }
}
async function loadEvents(run: StatusRun, at = 0) {
    if (!selectedJob.value) return
    const version = ++detailVersion
    selectedRun.value = run
    events.value = null
    detailError.value = ''
    detailBusy.value = true
    try {
        const result = await status.detail(selectedJob.value.id, run.id, at)
        if (version === detailVersion) { selectedRun.value = result.run; events.value = result.events }
    } catch (err) {
        if (version === detailVersion) detailError.value = err instanceof Error ? err.message : 'Unable to fetch events'
    } finally { if (version === detailVersion) detailBusy.value = false }
}
function closeDetail() { detailVersion++; selectedJob.value = null; detailBusy.value = false }
function visibility() { if (!document.hidden && token.value) void refresh() }
watch([search, filter, mode, archived], () => {
    offset.value = 0
    clearTimeout(debounce)
    debounce = setTimeout(refresh, 250)
})
watch(offset, refresh)
onMounted(() => {
    void refresh()
    timer = setInterval(() => { if (!document.hidden) void refresh() }, 15000)
    document.addEventListener('visibilitychange', visibility)
})
onBeforeUnmount(() => {
    clearInterval(timer)
    clearTimeout(debounce)
    document.removeEventListener('visibilitychange', visibility)
    detailVersion++
    status.dispose()
})
</script>

<template>
    <section class="mx-auto max-w-7xl space-y-6 p-8">
        <header class="flex flex-wrap items-center justify-between gap-4">
            <div class="flex items-center gap-3">
                <Activity class="h-6 w-6 text-gemini-blue" />
                <div><h1 class="text-2xl font-semibold tracking-tight">Homelab status</h1><p class="text-sm leading-relaxed text-gemini-subtext">Jobs, runs, and service heartbeats.</p></div>
            </div>
            <div v-if="token" class="flex gap-2">
                <BaseButton @click="refresh"><RefreshCw class="h-4 w-4" />Refresh</BaseButton>
                <BaseButton v-if="page?.canManage" variant="primary" @click="edit(null)"><Plus class="h-4 w-4" />Register job</BaseButton>
                <BaseButton @click="disconnect">Lock</BaseButton>
            </div>
        </header>
        <form v-if="!token || (!page && error)" class="space-y-4 rounded-3xl border border-gemini-border bg-gemini-card p-6 shadow-sm" @submit.prevent="connect">
            <h2 class="font-medium">Unlock Status</h2>
            <p class="text-sm leading-relaxed text-gemini-subtext">Configure STATUS_ADMIN_TOKEN on the server, then enter it here. STATUS_READ_TOKEN grants read-only access. This browser remembers your token across visits. Lock removes the saved token. Use HTTPS for network access.</p>
            <label class="block text-sm">Status access token<BaseInput v-model="tokenInput" type="password" required autocomplete="off" /></label>
            <BaseButton variant="primary" type="submit">Unlock</BaseButton>
        </form>
        <p v-if="token && !page && !error" class="text-sm text-gemini-subtext">Loading saved Status access...</p>
        <p v-if="storageError" role="alert" class="text-sm text-gemini-purple">{{ storageError }}</p>
        <div v-if="error" role="alert" class="flex items-start gap-3 rounded-xl border border-gemini-purple bg-gemini-surface p-4 text-gemini-purple">
            <AlertTriangle class="h-5 w-5 shrink-0" /><div><p class="font-medium">Status unavailable or access denied. Displayed data may be stale.</p><p>{{ error }}</p><p>Last successful refresh: {{ date(lastRefresh) }}</p></div>
        </div>
        <p v-if="actionError && !showEditor" role="alert" class="text-gemini-purple">{{ actionError }}</p>
        <template v-if="page">
            <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4" :class="{ 'opacity-50': error }">
                <div v-for="stat in [{ name: 'Needs attention', value: attention }, { name: 'Active runs', value: active }, { name: 'Unknown jobs', value: unknown }, { name: 'Paused jobs', value: paused }]" :key="stat.name" class="rounded-3xl border border-gemini-border bg-gemini-card p-6 shadow-sm">
                    <p class="text-sm text-gemini-subtext">{{ stat.name }}</p><p class="mt-2 text-3xl font-medium">{{ stat.value }}</p>
                </div>
            </div>
            <p class="text-xs leading-relaxed text-gemini-subtext">Counts reflect this filtered page. Evaluated {{ date(page.evaluatedAt) }}. Accepted {{ date(page.ingestion.lastAcceptedAt) }}. Rejected events {{ page.ingestion.rejectedEvents }}; storage errors {{ page.ingestion.storageErrors }} (since server start).</p>
            <div class="flex flex-wrap items-end gap-3">
                <label class="min-w-0 flex-1 text-sm">Search name, host, or tag<BaseInput v-model="search" type="search" placeholder="backup, ubuntu..." /></label>
                <label class="text-sm">Condition<select v-model="filter" class="block rounded-xl border border-gemini-border bg-gemini-card px-3 py-2.5">
                    <option value="">All</option><option value="attention">Needs attention</option><option value="unknown">Unknown</option><option value="late">Late</option><option value="stale">Stale</option><option value="overdue">Overdue</option><option value="reported_unhealthy">Reported unhealthy</option><option value="paused">Paused</option>
                </select></label>
                <label class="text-sm">Mode<select v-model="mode" class="block rounded-xl border border-gemini-border bg-gemini-card px-3 py-2.5">
                    <option value="">All</option><option value="manual">Manual</option><option value="scheduled">Scheduled</option><option value="heartbeat">Heartbeat</option>
                </select></label>
                <BaseButton @click="archived = !archived">{{ archived ? 'Show current jobs' : 'Show archived jobs' }}</BaseButton>
            </div>
            <div v-if="!jobs.length" class="rounded-3xl border border-gemini-border p-8 text-center text-gemini-subtext">No jobs match. Register a job to begin reporting.</div>
            <div class="grid gap-4 lg:grid-cols-2" :class="{ 'opacity-50': error }">
                <article v-for="job in jobs" :key="job.id" class="space-y-3 rounded-xl border bg-gemini-card p-4 shadow-sm" :class="job.needsAttention ? 'border-gemini-purple' : 'border-gemini-border'">
                    <div class="flex items-start justify-between gap-3">
                        <div><h2 class="font-semibold tracking-tight">{{ job.name }}</h2><p class="text-xs text-gemini-subtext">{{ job.id }} · {{ job.mode }} · {{ job.tags.join(', ') }}</p></div>
                        <AlertTriangle v-if="job.needsAttention" class="h-5 w-5 shrink-0 text-gemini-purple" aria-label="Needs attention" />
                    </div>
                    <p :class="job.needsAttention ? 'text-gemini-purple' : 'text-gemini-blue'" class="text-sm font-medium capitalize">{{ conditionText(job) }}</p>
                    <p class="text-sm">{{ job.activeRuns.length }} running · Last outcome: {{ job.lastRun?.outcome ?? 'Unknown' }}</p>
                    <p v-if="job.serviceHealth" class="text-sm">Service reports: {{ job.serviceHealth }}</p>
                    <p v-if="job.lastHeartbeat?.payload" class="text-sm">{{ job.lastHeartbeat.payload.source ?? 'Unknown source' }}: {{ job.lastHeartbeat.payload.message ?? 'Heartbeat received' }}</p>
                    <p v-if="job.description" class="text-sm leading-relaxed text-gemini-subtext">{{ job.description }}</p>
                    <div class="text-xs leading-relaxed text-gemini-subtext">
                        <p>Last seen: {{ date(job.lastSeenAt) }} · Last success: {{ date(job.lastSuccessAt) }}</p>
                        <p v-if="job.mode === 'scheduled'">Next expected: {{ date(job.nextExpectedAt) }} · Missed starts: {{ job.missedStarts }}</p>
                        <p v-if="job.lastRun">{{ duration(job.lastRun) }} · Source: {{ job.lastRun.source ?? 'Unknown' }}</p>
                    </div>
                    <div v-for="run in job.activeRuns" :key="run.id" class="rounded-xl bg-gemini-surface p-3 text-sm">
                        <p>{{ run.source ?? 'Unknown source' }}: {{ run.message ?? 'Running' }}</p>
                        <p v-if="run.progress">{{ run.progress.current }}{{ run.progress.total ? ` / ${run.progress.total}` : '' }} {{ run.progress.unit }}</p>
                    </div>
                    <div class="flex flex-wrap gap-2">
                        <BaseButton @click="loadRuns(job)">Runs &amp; details</BaseButton>
                        <BaseButton v-if="page.canManage" :disabled="busy" @click="edit(job)">Edit</BaseButton>
                        <BaseButton v-if="page.canManage && !job.archived" :disabled="busy" @click="change(job, { paused: !job.paused })">{{ job.paused ? 'Resume' : 'Pause' }}</BaseButton>
                    </div>
                </article>
            </div>
            <div class="flex items-center justify-between gap-4">
                <BaseButton :disabled="offset === 0" @click="offset = Math.max(0, offset - 50)">Previous jobs</BaseButton>
                <span class="text-sm">{{ page.total }} matching jobs</span>
                <BaseButton :disabled="offset + 50 >= page.total" @click="offset += 50">Next jobs</BaseButton>
            </div>
        </template>
        <StatusJobEditor v-if="showEditor" :job="editingJob" :busy="busy" :error="actionError" @close="showEditor = false" @save="save" />
        <ModalShell v-if="reportingToken" title="Save reporting token" @close="reportingToken = ''">
            <template #header><h2 class="font-semibold">Save token for {{ reportingJobId }}</h2></template>
            <template #body>
                <p class="mb-4 text-sm leading-relaxed">This write-only token is shown once. Save it in a protected environment file as WOLF_STATUS_TOKEN. Rotation immediately invalidates the previous token.</p>
                <pre class="overflow-x-auto whitespace-pre-wrap break-all rounded-xl bg-gemini-surface p-4 text-sm">{{ reportingToken }}</pre>
                <BaseButton class="mt-4" variant="primary" @click="reportingToken = ''">I've saved it</BaseButton>
            </template>
        </ModalShell>
        <ModalShell v-if="selectedJob" :title="selectedJob.name" @close="closeDetail">
            <template #header><h2 class="font-semibold">{{ selectedJob.name }}</h2></template>
            <template #body>
                <p class="mb-4 text-sm">Conditions: {{ conditionText(selectedJob) }} · Service health: {{ selectedJob.serviceHealth ?? 'Unknown' }}</p>
                <pre v-if="selectedJob.lastHeartbeat?.payload" class="mb-4 max-h-96 overflow-auto whitespace-pre-wrap break-words rounded-xl bg-gemini-surface p-4 text-xs">{{ JSON.stringify(selectedJob.lastHeartbeat.payload, null, 2) }}</pre>
                <div v-if="page?.canManage" class="mb-4 flex flex-wrap gap-2">
                    <BaseButton :disabled="busy" @click="change(selectedJob, { archived: !selectedJob.archived })">{{ selectedJob.archived ? 'Restore job' : 'Archive job (keep history)' }}</BaseButton>
                    <BaseButton :disabled="busy" @click="rotate(selectedJob)">{{ confirmRotate ? 'Confirm: invalidate old token' : 'Rotate reporting token' }}</BaseButton>
                    <BaseButton v-if="confirmRotate" @click="confirmRotate = false">Cancel rotation</BaseButton>
                </div>
                <p v-if="detailError || actionError" role="alert" class="mb-4 text-gemini-purple">{{ detailError || actionError }}</p>
                <p v-if="detailBusy" class="text-sm">Loading...</p>
                <template v-if="runPage && !selectedRun">
                    <p v-if="!runPage.items.length" class="text-sm text-gemini-subtext">No runs. Service heartbeats do not create runs.</p>
                    <div v-for="run in runPage.items" :key="run.id" class="mb-3 space-y-2 rounded-xl border border-gemini-border p-4">
                        <p class="text-sm">{{ run.outcome }} · {{ date(run.startedAt) }} · {{ duration(run) }}</p><p class="break-all text-xs text-gemini-subtext">{{ run.id }} · {{ run.source }}</p>
                        <BaseButton @click="loadEvents(run)">Open timeline</BaseButton>
                    </div>
                    <div class="flex gap-2">
                        <BaseButton :disabled="detailBusy || runPage.offset === 0" @click="loadRuns(selectedJob, Math.max(0, runPage.offset - 20))">Previous runs</BaseButton>
                        <BaseButton :disabled="detailBusy || runPage.offset + 20 >= runPage.total" @click="loadRuns(selectedJob, runPage.offset + 20)">Next runs</BaseButton>
                        <BaseButton :disabled="detailBusy" @click="loadRuns(selectedJob, runPage.offset)">Refresh runs</BaseButton>
                    </div>
                </template>
                <template v-if="selectedRun">
                    <BaseButton class="mb-4" @click="loadRuns(selectedJob)">Back to runs</BaseButton>
                    <p class="text-sm">{{ selectedRun.outcome }} · {{ duration(selectedRun) }} · Exit code: {{ selectedRun.exitCode ?? 'Not reported' }}</p>
                    <p class="mb-4 text-sm">{{ selectedRun.message }}</p>
                    <pre v-if="selectedRun.metrics" class="mb-4 overflow-x-auto rounded-xl bg-gemini-surface p-4 text-xs">{{ JSON.stringify(selectedRun.metrics, null, 2) }}</pre>
                    <div v-for="event in events?.items ?? []" :key="event.eventId" class="mb-3 space-y-2 rounded-xl border border-gemini-border p-4">
                        <p class="text-xs text-gemini-subtext">#{{ event.sequence }} {{ event.type }} · Received {{ date(event.receivedAt) }}</p>
                        <p v-if="event.clockSkewMs !== null && Math.abs(event.clockSkewMs) > 60000" class="text-xs text-gemini-purple">Producer timestamp differs by {{ Math.round(event.clockSkewMs / 1000) }}s (clock skew or delayed delivery).</p>
                        <p v-if="!event.payload" class="text-sm text-gemini-subtext">Event details expired; identity retained for safe retries.</p>
                        <template v-else>
                            <p class="text-sm">{{ event.payload.message }}</p>
                            <pre v-if="event.payload.log" class="max-h-96 overflow-auto whitespace-pre-wrap break-words rounded-xl bg-gemini-surface p-4 text-xs">{{ event.payload.log }}</pre>
                            <pre v-if="event.payload.metadata" class="overflow-auto whitespace-pre-wrap break-words text-xs">{{ JSON.stringify(event.payload.metadata, null, 2) }}</pre>
                        </template>
                    </div>
                    <div v-if="events" class="flex flex-wrap gap-2">
                        <BaseButton :disabled="detailBusy || events.offset === 0" @click="loadEvents(selectedRun, Math.max(0, events.offset - 50))">Previous events</BaseButton>
                        <BaseButton :disabled="detailBusy || events.offset + 50 >= events.total" @click="loadEvents(selectedRun, events.offset + 50)">Next events</BaseButton>
                        <BaseButton :disabled="detailBusy" @click="loadEvents(selectedRun, events.offset)">Refresh timeline</BaseButton>
                    </div>
                </template>
            </template>
        </ModalShell>
    </section>
</template>
