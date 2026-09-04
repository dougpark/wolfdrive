<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { Plus, Tag as TagIcon, X } from 'lucide-vue-next'
import { useTags } from '@/composables/useTags'
import type { MediaFile, Tag } from '@/types/media'

const props = defineProps<{
    file: MediaFile
}>()

const emit = defineEmits<{
    (e: 'close'): void
    (e: 'saved', tags: Tag[]): void
}>()

const { allTags, fetchTags, createTag } = useTags()

const selected = ref<Tag[]>([...(props.file.tags ?? [])])
const query = ref('')
const isSaving = ref(false)
const errorMessage = ref('')
const inputEl = ref<HTMLInputElement | null>(null)

const suggestions = computed(() => {
    const q = query.value.trim().toLowerCase()
    const selectedIds = new Set(selected.value.map((t) => t.id))
    return allTags.value
        .filter((t) => !selectedIds.has(t.id) && (!q || t.name.toLowerCase().includes(q)))
        .slice(0, 8)
})

const exactMatch = computed(() =>
    allTags.value.some((t) => t.name.toLowerCase() === query.value.trim().toLowerCase()),
)
const canCreate = computed(() => query.value.trim().length > 0 && !exactMatch.value)

function addTag(tag: Tag) {
    if (selected.value.some((t) => t.id === tag.id)) return
    selected.value = [...selected.value, tag]
    query.value = ''
    nextTick(() => inputEl.value?.focus())
}

function removeTag(id: string) {
    selected.value = selected.value.filter((t) => t.id !== id)
}

async function handleCreate() {
    const name = query.value.trim()
    if (!name) return
    const tag = await createTag(name)
    if (tag) addTag(tag)
}

function handleKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
        emit('close')
        return
    }
    if (event.key === 'Enter') {
        event.preventDefault()
        if (suggestions.value.length > 0) {
            addTag(suggestions.value[0]!)
        } else if (canCreate.value) {
            handleCreate()
        }
    }
    if (event.key === 'Backspace' && !query.value && selected.value.length) {
        removeTag(selected.value[selected.value.length - 1]!.id)
    }
}

async function save() {
    isSaving.value = true
    errorMessage.value = ''
    try {
        const res = await fetch(`/api/files/${encodeURIComponent(props.file.id)}/tags`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ tagIds: selected.value.map((t) => t.id) }),
        })
        if (!res.ok) {
            const body = await res.json().catch(() => null)
            throw new Error(body?.error ?? `Save failed (${res.status})`)
        }
        const saved = await res.json() as Tag[]
        emit('saved', saved)
    } catch (err) {
        errorMessage.value = err instanceof Error ? err.message : 'Failed to save tags'
    } finally {
        isSaving.value = false
    }
}

onMounted(() => {
    fetchTags()
    document.addEventListener('keydown', handleKeydown)
})
onBeforeUnmount(() => document.removeEventListener('keydown', handleKeydown))
</script>

<template>
    <div class="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" role="dialog"
        aria-modal="true" :aria-label="`Manage tags for ${props.file.filename}`" @click.self="emit('close')">
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
                        <p class="truncate text-xs text-gemini-subtext" :title="props.file.filename">
                            {{ props.file.filename }}
                        </p>
                    </div>
                </div>
                <button type="button"
                    class="cursor-pointer rounded-lg p-2 text-gemini-subtext transition-colors hover:bg-gemini-surface hover:text-gemini-text"
                    aria-label="Close" title="Close" @click="emit('close')">
                    <X class="h-4 w-4" />
                </button>
            </div>

            <!-- Selected tag chips + input -->
            <div
                class="flex flex-wrap items-center gap-2 rounded-xl border border-gemini-border bg-gemini-card p-2.5 focus-within:border-gemini-blue transition-colors">
                <span v-for="tag in selected" :key="tag.id"
                    class="flex items-center gap-1.5 rounded-full border border-gemini-blue/30 bg-gemini-blue/10 px-3 py-1 text-xs font-medium text-gemini-blue">
                    {{ tag.name }}
                    <button type="button" class="cursor-pointer text-gemini-blue/70 hover:text-gemini-blue"
                        :aria-label="`Remove ${tag.name}`" @click="removeTag(tag.id)">
                        <X class="h-3 w-3" />
                    </button>
                </span>
                <input ref="inputEl" v-model="query" type="text"
                    :placeholder="selected.length ? 'Add another tag…' : 'Search or create a tag…'"
                    class="min-w-[8rem] flex-1 bg-transparent px-1 py-1 text-sm text-gemini-text placeholder:text-gemini-subtext focus:outline-none" />
            </div>

            <!-- Suggestions -->
            <div v-if="suggestions.length || canCreate"
                class="mt-2 max-h-48 overflow-y-auto rounded-xl border border-gemini-border">
                <button v-for="tag in suggestions" :key="tag.id" type="button"
                    class="flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-left text-sm text-gemini-text transition-colors hover:bg-gemini-surface"
                    @click="addTag(tag)">
                    <TagIcon class="h-3.5 w-3.5 text-gemini-subtext" />
                    <span>{{ tag.name }}</span>
                </button>
                <button v-if="canCreate" type="button"
                    class="flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-left text-sm text-gemini-blue transition-colors hover:bg-gemini-surface"
                    @click="handleCreate">
                    <Plus class="h-3.5 w-3.5" />
                    <span>Create "{{ query.trim() }}"</span>
                </button>
            </div>

            <p v-if="errorMessage" class="mt-3 text-xs font-medium text-red-500">{{ errorMessage }}</p>

            <!-- Footer -->
            <div class="mt-6 flex justify-end gap-3">
                <button type="button"
                    class="cursor-pointer rounded-full border border-gemini-border bg-gemini-card px-6 py-3 text-sm font-medium text-gemini-text transition-all hover:bg-gemini-surface"
                    @click="emit('close')">
                    Cancel
                </button>
                <button type="button"
                    class="cursor-pointer rounded-full bg-gemini-blue px-6 py-3 text-sm font-medium text-white transition-all hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                    :disabled="isSaving" @click="save">
                    {{ isSaving ? 'Saving…' : 'Save' }}
                </button>
            </div>
        </div>
    </div>
</template>
