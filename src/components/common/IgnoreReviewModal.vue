<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import ModalShell from '@/components/ModalShell.vue'
import BaseButton from '@/components/ui/BaseButton.vue'

const props = defineProps<{ patterns: string[] }>()
const emit = defineEmits<{ close: []; saved: [patterns: string[]] }>()
type Kind = 'added' | 'changed' | 'removed'
interface FileInfo { directoryId: string; sizeBytes: number; mtimeMs: number; mimeType: string | null; mediaCategory: string; relativePath: string }
interface Impact {
    tags: string[]
    categories: string[]
    aiSummary: string | null
    aiTags: string[]
    hasReadingProgress: boolean
}
interface Change {
    path: string
    reason: string
    before: FileInfo | null
    after: FileInfo | null
    impact: Impact | null
    beforeFolder: string | null
    afterFolder: string | null
    beforeFolderTags: string[]
    afterFolderTags: string[]
}
interface Preview {
    id: string
    expiresAt: string
    counts: Record<Kind, number>
    missingCount: number
    indexedCount: number
    disabledDirectories: string[]
}

const preview = ref<Preview | null>(null)
const kind = ref<Kind>('removed')
const changes = ref<Change[]>([])
const offset = ref(0)
const total = ref(0)
const busy = ref(true)
const loadingPage = ref(false)
const error = ref('')
const largeRemoval = computed(() => !!preview.value && preview.value.counts.removed >= 10
    && preview.value.counts.removed * 4 >= preview.value.indexedCount)

async function responseError(response: Response) {
    const body = await response.json() as { error?: string }
    return body.error || `Request failed (${response.status})`
}

async function loadPage(nextKind: Kind, nextOffset = 0) {
    if (!preview.value || loadingPage.value) return
    loadingPage.value = true
    error.value = ''
    try {
        const response = await fetch(`/api/settings/ignore/preview/${encodeURIComponent(preview.value.id)}?kind=${nextKind}&offset=${nextOffset}`)
        if (!response.ok) throw new Error(await responseError(response))
        const page = await response.json() as { items: Change[]; total: number; offset: number }
        kind.value = nextKind
        offset.value = page.offset
        total.value = page.total
        changes.value = page.items
    } catch (err) {
        error.value = err instanceof Error ? err.message : 'Unable to load preview.'
    } finally {
        loadingPage.value = false
    }
}

async function createPreview() {
    busy.value = true
    error.value = ''
    try {
        const response = await fetch('/api/settings/ignore/preview', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ patterns: props.patterns }),
        })
        if (!response.ok) throw new Error(await responseError(response))
        preview.value = await response.json() as Preview
        await loadPage('removed')
    } catch (err) {
        error.value = err instanceof Error ? err.message : 'Unable to create preview.'
    } finally {
        busy.value = false
    }
}

async function close() {
    if (busy.value) return
    if (preview.value) {
        try {
            const response = await fetch(`/api/settings/ignore/preview/${encodeURIComponent(preview.value.id)}`, { method: 'DELETE' })
            if (!response.ok && response.status !== 404) throw new Error(await responseError(response))
        } catch (err) {
            error.value = err instanceof Error ? err.message : 'Unable to discard preview.'
            return
        }
    }
    emit('close')
}

async function accept() {
    if (!preview.value || busy.value) return
    busy.value = true
    error.value = ''
    try {
        const response = await fetch(`/api/settings/ignore/preview/${encodeURIComponent(preview.value.id)}/accept`, { method: 'POST' })
        if (!response.ok) throw new Error(await responseError(response))
        const result = await response.json() as { patterns: string[] }
        emit('saved', result.patterns)
    } catch (err) {
        error.value = err instanceof Error ? err.message : 'Unable to apply preview.'
    } finally {
        busy.value = false
    }
}

function contentChanged(change: Change) {
    return change.before && change.after
        && (change.before.sizeBytes !== change.after.sizeBytes || change.before.mtimeMs !== change.after.mtimeMs)
}

onMounted(createPreview)
</script>

<template>
    <ModalShell title="Review ignore rules" @close="close">
        <template #header>
            <h2 class="text-lg font-semibold tracking-tight">Review ignore rules</h2>
        </template>
        <template #body>
            <div class="space-y-4">
                <p class="text-sm text-gemini-subtext">
                    No rules or indexed files change until you accept. Original files on disk are never deleted.
                    The filesystem will be checked again before applying.
                </p>
                <p v-if="busy" role="status" class="text-sm text-gemini-text">
                    {{ preview ? 'Checking and applying changes…' : 'Scanning monitored folders for preview…' }}
                </p>
                <p v-if="error" role="alert" class="rounded-xl border border-gemini-border bg-gemini-surface p-3 text-sm text-gemini-text">{{ error }}</p>
                <template v-if="preview">
                    <p v-if="largeRemoval" class="rounded-xl border border-gemini-border bg-gemini-surface p-3 text-sm font-semibold">
                        Large removal: {{ preview.counts.removed }} of {{ preview.indexedCount }} indexed files are affected.
                        Review the list and consider backing up your database before accepting.
                    </p>
                    <p v-if="preview.missingCount" class="rounded-xl border border-gemini-border bg-gemini-surface p-3 text-sm">
                        {{ preview.missingCount }} files are missing from the scanned folders. Check that all storage is mounted before accepting.
                    </p>
                    <p v-if="preview.counts.removed" class="text-sm text-gemini-subtext">
                        Removed entries lose file tags, categories, reading progress, and stored AI metadata. Shared tags remain.
                        Back up the database before accepting.
                    </p>
                    <p v-if="preview.counts.changed" class="text-sm text-gemini-subtext">Changed file contents clear their stored AI metadata.</p>
                    <div v-if="preview.disabledDirectories.length" class="rounded-xl border border-gemini-border bg-gemini-surface p-3 text-sm">
                        Disabled folders were not scanned or changed:
                        <ul class="mt-1 list-inside list-disc">
                            <li v-for="path in preview.disabledDirectories" :key="path" class="break-all">{{ path }}</li>
                        </ul>
                    </div>
                    <p class="text-xs text-gemini-subtext">Preview expires {{ new Date(preview.expiresAt).toLocaleString() }}. Overlapping folders retain their existing owner when possible; a file included by any enabled folder remains indexed.</p>
                    <div class="flex flex-wrap gap-2">
                        <BaseButton v-for="item in (['removed', 'changed', 'added'] as const)" :key="item"
                            :variant="kind === item ? 'primary' : 'secondary'" :disabled="busy || loadingPage"
                            @click="loadPage(item)">
                            {{ item }}: {{ preview.counts[item].toLocaleString() }}
                        </BaseButton>
                    </div>
                    <p v-if="loadingPage" role="status" class="text-sm text-gemini-subtext">Loading changes…</p>
                    <p v-else-if="!changes.length" class="text-sm text-gemini-subtext">No {{ kind }} files.</p>
                    <ul v-else class="max-h-96 space-y-2 overflow-y-auto">
                        <li v-for="change in changes" :key="change.path" class="rounded-xl border border-gemini-border p-3 text-sm">
                            <p class="break-all font-medium">{{ change.path }}</p>
                            <p class="text-gemini-subtext">{{ change.reason }}</p>
                            <p v-if="change.beforeFolder" class="break-all text-xs text-gemini-subtext">
                                Current folder: {{ change.beforeFolder }}<span v-if="change.beforeFolderTags.length"> (tags: {{ change.beforeFolderTags.join(', ') }})</span>
                            </p>
                            <p v-if="change.afterFolder && change.afterFolder !== change.beforeFolder" class="break-all text-xs text-gemini-subtext">
                                New folder: {{ change.afterFolder }}<span v-if="change.afterFolderTags.length"> (tags: {{ change.afterFolderTags.join(', ') }})</span>
                            </p>
                            <p v-if="!change.before && change.after" class="text-xs text-gemini-subtext">
                                New: {{ change.after.sizeBytes.toLocaleString() }} bytes; {{ change.after.mimeType || 'unknown type' }};
                                modified {{ new Date(change.after.mtimeMs).toLocaleString() }}
                            </p>
                            <p v-if="change.before && !change.after" class="text-xs text-gemini-subtext">
                                Indexed: {{ change.before.sizeBytes.toLocaleString() }} bytes; {{ change.before.mimeType || 'unknown type' }};
                                modified {{ new Date(change.before.mtimeMs).toLocaleString() }}
                            </p>
                            <p v-if="change.before && change.after" class="text-xs text-gemini-subtext">
                                Size: {{ change.before.sizeBytes.toLocaleString() }} → {{ change.after.sizeBytes.toLocaleString() }} bytes;
                                modified: {{ new Date(change.before.mtimeMs).toLocaleString() }} → {{ new Date(change.after.mtimeMs).toLocaleString() }}
                                <span v-if="change.before.directoryId !== change.after.directoryId">; indexed folder changes</span>
                            </p>
                            <p v-if="change.before && change.after && (change.before.mimeType !== change.after.mimeType || change.before.mediaCategory !== change.after.mediaCategory)"
                                class="text-xs text-gemini-subtext">
                                Type: {{ change.before.mimeType || 'unknown' }} ({{ change.before.mediaCategory }}) →
                                {{ change.after.mimeType || 'unknown' }} ({{ change.after.mediaCategory }})
                            </p>
                            <p v-if="change.before && change.after && change.before.relativePath !== change.after.relativePath"
                                class="break-all text-xs text-gemini-subtext">
                                Relative path: {{ change.before.relativePath }} → {{ change.after.relativePath }}
                            </p>
                            <div v-if="change.impact" class="mt-2 space-y-1 text-xs text-gemini-subtext">
                                <p v-if="kind === 'removed'">The following indexed information will be removed:</p>
                                <p v-if="contentChanged(change)">Stored AI metadata will be cleared because the file changed. Other assignments remain.</p>
                                <p v-if="change.impact.tags.length">Tags: {{ change.impact.tags.join(', ') }}</p>
                                <p v-if="change.impact.categories.length">Categories: {{ change.impact.categories.join(', ') }}</p>
                                <p v-if="change.impact.aiSummary" class="break-words">AI summary: {{ change.impact.aiSummary }}</p>
                                <p v-if="change.impact.aiTags.length">AI tags: {{ change.impact.aiTags.join(', ') }}</p>
                                <p v-if="change.impact.hasReadingProgress">Reading progress exists.</p>
                            </div>
                        </li>
                    </ul>
                    <div v-if="total > 50" class="flex items-center justify-between gap-2 text-sm text-gemini-subtext">
                        <BaseButton :disabled="busy || loadingPage || offset === 0" @click="loadPage(kind, Math.max(0, offset - 50))">Previous</BaseButton>
                        <span>{{ offset + 1 }}–{{ Math.min(offset + 50, total) }} of {{ total }}</span>
                        <BaseButton :disabled="busy || loadingPage || offset + 50 >= total" @click="loadPage(kind, offset + 50)">Next</BaseButton>
                    </div>
                </template>
                <div class="flex flex-wrap justify-end gap-2">
                    <BaseButton :disabled="busy" @click="close">Cancel</BaseButton>
                    <BaseButton v-if="!preview && !busy" variant="primary" @click="createPreview">Try again</BaseButton>
                    <BaseButton v-if="preview" variant="primary" :disabled="busy || loadingPage" @click="accept">Accept changes</BaseButton>
                </div>
            </div>
        </template>
    </ModalShell>
</template>
