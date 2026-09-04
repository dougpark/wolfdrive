<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { Check, Minus, Plus, Tag as TagIcon, X } from 'lucide-vue-next'
import { useTags } from '@/composables/useTags'
import type { Tag } from '@/types/media'

const props = defineProps<{
    fileIds: string[]
}>()

const emit = defineEmits<{
    (e: 'close'): void
    /** Fired after any tag is added/removed so the caller can refresh the file list. */
    (e: 'changed'): void
}>()

const { allTags, fetchTags, createTag } = useTags()

/** tagId -> number of selected files that currently have it. */
const usage = ref<Map<string, number>>(new Map())
const pendingIds = ref<Set<string>>(new Set())
const query = ref('')
const isLoading = ref(true)
const errorMessage = ref('')
const inputEl = ref<HTMLInputElement | null>(null)

type TagStatus = 'all' | 'some' | 'none'

function statusFor(tagId: string): TagStatus {
    const count = usage.value.get(tagId) ?? 0
    if (count === 0) return 'none'
    return count === props.fileIds.length ? 'all' : 'some'
}

const knownTags = computed<Tag[]>(() => {
    const byId = new Map(allTags.value.map((t) => [t.id, t] as const))
    // Include any tag present in usage even if it fell out of the shared cache.
    for (const id of usage.value.keys()) {
        if (!byId.has(id)) byId.set(id, { id, name: id, color: null })
    }
    return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name))
})

const filteredTags = computed(() => {
    const q = query.value.trim().toLowerCase()
    return q ? knownTags.value.filter((t) => t.name.toLowerCase().includes(q)) : knownTags.value
})

const exactMatch = computed(() =>
    allTags.value.some((t) => t.name.toLowerCase() === query.value.trim().toLowerCase()),
)
const canCreate = computed(() => query.value.trim().length > 0 && !exactMatch.value)

async function fetchUsage() {
    isLoading.value = true
    try {
        const res = await fetch(`/api/tags/usage?ids=${props.fileIds.map(encodeURIComponent).join(',')}`)
        if (res.ok) {
            const rows = await res.json() as { id: string; fileCount: number }[]
            usage.value = new Map(rows.map((r) => [r.id, r.fileCount]))
        }
    } catch (err) {
        console.error('Failed to load batch tag usage:', err)
    } finally {
        isLoading.value = false
    }
}

/** Adds the tag to every selected file that doesn't already have it, or removes it from all. */
async function toggleTag(tag: Tag) {
    if (pendingIds.value.has(tag.id)) return
    const status = statusFor(tag.id)
    const action = status === 'none' ? 'add' : 'remove'

    pendingIds.value = new Set(pendingIds.value).add(tag.id)
    errorMessage.value = ''
    try {
        const res = await fetch(`/api/files/tags/${action}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ fileIds: props.fileIds, tagId: tag.id }),
        })
        if (!res.ok) {
            const body = await res.json().catch(() => null)
            throw new Error(body?.error ?? `Failed to ${action} tag`)
        }
        const next = new Map(usage.value)
        next.set(tag.id, action === 'add' ? props.fileIds.length : 0)
        usage.value = next
        emit('changed')
    } catch (err) {
        errorMessage.value = err instanceof Error ? err.message : `Failed to ${action} tag`
    } finally {
        const next = new Set(pendingIds.value)
        next.delete(tag.id)
        pendingIds.value = next
    }
}

async function handleCreate() {
    const name = query.value.trim()
    if (!name) return
    const tag = await createTag(name)
    query.value = ''
    nextTick(() => inputEl.value?.focus())
    if (tag) await toggleTag(tag)
}

function handleKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape') emit('close')
}

onMounted(() => {
    fetchTags()
    fetchUsage()
    document.addEventListener('keydown', handleKeydown)
})
onBeforeUnmount(() => document.removeEventListener('keydown', handleKeydown))
</script>

<template>
    <div class="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" role="dialog"
        aria-modal="true" :aria-label="`Manage tags for ${props.fileIds.length} files`" @click.self="emit('close')">
        <div
            class="w-full max-w-md rounded-3xl border border-gemini-border bg-gemini-card p-6 shadow-[0_2px_8px_rgba(0,0,0,0.06)]">
            <!-- Header -->
            <div class="mb-5 flex items-start justify-between gap-4">
                <div class="flex min-w-0 items-center gap-3">
                    <span class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gemini-surface">
                        <TagIcon class="h-5 w-5 text-gemini-blue" />
                    </span>
                    <div class="min-w-0">
                        <h2 class="text-base font-semibold tracking-tight text-gemini-text">Manage tags</h2>
                        <p class="text-xs text-gemini-subtext">
                            {{ props.fileIds.length }} file{{ props.fileIds.length === 1 ? '' : 's' }} selected
                        </p>
                    </div>
                </div>
                <button type="button"
                    class="cursor-pointer rounded-lg p-2 text-gemini-subtext transition-colors hover:bg-gemini-surface hover:text-gemini-text"
                    aria-label="Close" title="Close" @click="emit('close')">
                    <X class="h-4 w-4" />
                </button>
            </div>

            <!-- Search / create -->
            <input ref="inputEl" v-model="query" type="text" placeholder="Search or create a tag…"
                class="w-full rounded-xl border border-gemini-border bg-gemini-card px-3.5 py-2.5 text-sm text-gemini-text placeholder:text-gemini-subtext focus:border-gemini-blue focus:outline-none transition-colors"
                @keydown.enter="canCreate && filteredTags.length === 0 && handleCreate()" />

            <p class="mt-3 text-xs leading-relaxed text-gemini-subtext">
                A checked tag is applied to every selected file. A dash means only some of the selected files have it
                — click to remove it from all of them.
            </p>

            <!-- Tag list -->
            <div class="mt-2 max-h-64 overflow-y-auto rounded-xl border border-gemini-border">
                <p v-if="isLoading" class="px-3 py-4 text-center text-xs text-gemini-subtext">Loading tags…</p>
                <template v-else>
                    <button v-for="tag in filteredTags" :key="tag.id" type="button" :disabled="pendingIds.has(tag.id)"
                        class="flex w-full cursor-pointer items-center gap-3 px-3 py-2.5 text-left text-sm transition-colors hover:bg-gemini-surface disabled:cursor-wait disabled:opacity-60"
                        @click="toggleTag(tag)">
                        <span class="flex h-4 w-4 shrink-0 items-center justify-center rounded border" :class="statusFor(tag.id) === 'none'
                            ? 'border-gemini-border'
                            : 'border-gemini-blue bg-gemini-blue text-white'">
                            <Check v-if="statusFor(tag.id) === 'all'" class="h-3 w-3" />
                            <Minus v-else-if="statusFor(tag.id) === 'some'" class="h-3 w-3" />
                        </span>
                        <span class="truncate text-gemini-text">{{ tag.name }}</span>
                    </button>
                    <button v-if="canCreate" type="button"
                        class="flex w-full cursor-pointer items-center gap-3 px-3 py-2.5 text-left text-sm text-gemini-blue transition-colors hover:bg-gemini-surface"
                        @click="handleCreate">
                        <Plus class="h-4 w-4 shrink-0" />
                        <span>Create "{{ query.trim() }}"</span>
                    </button>
                    <p v-if="!filteredTags.length && !canCreate"
                        class="px-3 py-4 text-center text-xs text-gemini-subtext">
                        No tags found
                    </p>
                </template>
            </div>

            <p v-if="errorMessage" class="mt-3 text-xs font-medium text-red-500">{{ errorMessage }}</p>

            <!-- Footer -->
            <div class="mt-6 flex justify-end">
                <button type="button"
                    class="cursor-pointer rounded-full bg-gemini-blue px-6 py-3 text-sm font-medium text-white transition-all hover:opacity-90"
                    @click="emit('close')">
                    Done
                </button>
            </div>
        </div>
    </div>
</template>
