<script setup lang="ts">
import { ref } from 'vue'
import BaseButton from '../ui/BaseButton.vue'
import BaseInput from '../ui/BaseInput.vue'
import ModalShell from '../ModalShell.vue'
import type { MonitoringMode, StatusJobConfig, StatusJobSummary } from '@/types/status'

const props = defineProps<{ job: StatusJobSummary | null; busy: boolean; error: string }>()
const emit = defineEmits<{ close: []; save: [id: string, config: StatusJobConfig] }>()
const id = ref(props.job?.id ?? '')
const name = ref(props.job?.name ?? '')
const description = ref(props.job?.description ?? '')
const tags = ref(props.job?.tags.join(', ') ?? '')
const mode = ref<MonitoringMode>(props.job?.mode ?? 'manual')
const interval = ref(String(props.job?.intervalSeconds ?? 86400))
const anchor = ref(props.job?.anchorAt ? new Date(props.job.anchorAt).toISOString() : new Date().toISOString())
const grace = ref(String(props.job?.graceSeconds ?? 300))
const heartbeat = ref(props.job?.heartbeatSeconds ? String(props.job.heartbeatSeconds) : '')
const runtime = ref(props.job?.maxRuntimeSeconds ? String(props.job.maxRuntimeSeconds) : '')
const localError = ref('')

function save() {
    localError.value = ''
    const anchorAt = mode.value === 'scheduled' ? Date.parse(anchor.value) : null
    if (mode.value === 'scheduled' && !Number.isFinite(anchorAt)) {
        localError.value = 'Enter an ISO timestamp including Z or a timezone offset.'
        return
    }
    emit('save', id.value, {
        name: name.value, description: description.value,
        tags: tags.value.split(',').map(tag => tag.trim()).filter(Boolean),
        mode: mode.value,
        intervalSeconds: mode.value === 'scheduled' ? Number(interval.value) : null,
        anchorAt,
        graceSeconds: Number(grace.value),
        maxRuntimeSeconds: runtime.value ? Number(runtime.value) : null,
        heartbeatSeconds: heartbeat.value ? Number(heartbeat.value) : null,
    })
}
</script>

<template>
    <ModalShell :title="job ? 'Edit status job' : 'Register status job'" @close="emit('close')">
        <template #header><h2 class="text-lg font-semibold tracking-tight">{{ job ? 'Edit status job' : 'Register status job' }}</h2></template>
        <template #body>
            <form class="space-y-4" @submit.prevent="save">
                <label class="block text-sm">Job ID<BaseInput v-model="id" required :disabled="!!job" placeholder="nas-backup" maxlength="80" /></label>
                <label class="block text-sm">Display name<BaseInput v-model="name" required maxlength="120" /></label>
                <label class="block text-sm">Description<BaseInput v-model="description" maxlength="2048" /></label>
                <label class="block text-sm">Tags (comma-separated)<BaseInput v-model="tags" placeholder="ubuntu, backup" /></label>
                <label class="block text-sm">Monitoring mode
                    <select v-model="mode" class="mt-1 w-full rounded-xl border border-gemini-border bg-gemini-card px-3 py-2.5">
                        <option value="manual">Manual / one-off</option>
                        <option value="scheduled">Fixed-interval schedule</option>
                        <option value="heartbeat">Service heartbeat</option>
                    </select>
                </label>
                <template v-if="mode === 'scheduled'">
                    <label class="block text-sm">Interval (seconds)<BaseInput v-model="interval" type="number" required min="1" max="31536000" /></label>
                    <label class="block text-sm">First expected start (ISO timestamp)<BaseInput v-model="anchor" required placeholder="2026-11-22T02:00:00-06:00" /></label>
                    <label class="block text-sm">Start grace period (seconds)<BaseInput v-model="grace" type="number" min="0" max="31536000" required /></label>
                    <p class="text-xs leading-relaxed text-gemini-subtext">Intervals do not follow daylight-saving changes. Cron/timezone scheduling is not yet supported. Changing the schedule starts a new monitoring epoch; old run history remains.</p>
                </template>
                <label class="block text-sm">{{ mode === 'heartbeat' ? 'Heartbeat expiry (seconds, required)' : 'Active-run heartbeat expiry (seconds, optional)' }}
                    <BaseInput v-model="heartbeat" type="number" min="1" max="31536000" :required="mode === 'heartbeat'" />
                </label>
                <label v-if="mode !== 'heartbeat'" class="block text-sm">Maximum runtime (seconds, optional)<BaseInput v-model="runtime" type="number" min="1" max="31536000" /></label>
                <p v-if="localError || error" role="alert" class="text-sm text-gemini-purple">{{ localError || error }}</p>
                <div class="flex justify-end gap-2">
                    <BaseButton :disabled="busy" @click="emit('close')">Cancel</BaseButton>
                    <BaseButton type="submit" variant="primary" :disabled="busy">{{ busy ? 'Saving...' : 'Save job' }}</BaseButton>
                </div>
            </form>
        </template>
    </ModalShell>
</template>
