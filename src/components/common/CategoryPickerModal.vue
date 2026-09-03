<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { Check, Tags, X } from 'lucide-vue-next'
import { LIBRARY_CATEGORIES } from '@/config/libraryCategories'
import { SELECTABLE_LIBRARY_IDS, type SelectableLibraryId } from '@/config/libraryCategoryData'
import type { MediaFile } from '@/types/media'

const props = defineProps<{
    file: MediaFile
}>()

const emit = defineEmits<{
    (e: 'close'): void
    (e: 'saved', categories: string[]): void
}>()

const selectableCategories = SELECTABLE_LIBRARY_IDS.map((id) => LIBRARY_CATEGORIES[id])

const selected = ref<Set<SelectableLibraryId>>(
    new Set((props.file.customCategories ?? []) as SelectableLibraryId[]),
)
const isSaving = ref(false)
const errorMessage = ref('')

/** Libraries this file already belongs to via its mime-derived media category. */
const defaultLabels = computed(() =>
    Object.values(LIBRARY_CATEGORIES)
        .filter((lib) => lib.id !== 'files' && lib.categories.includes(props.file.mediaCategory))
        .map((lib) => lib.label),
)

function toggle(id: SelectableLibraryId) {
    const next = new Set(selected.value)
    if (next.has(id)) {
        next.delete(id)
    } else {
        next.add(id)
    }
    selected.value = next
}

function handleKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape') emit('close')
}

async function save() {
    isSaving.value = true
    errorMessage.value = ''
    try {
        const categories = [...selected.value]
        const res = await fetch(`/api/files/${encodeURIComponent(props.file.id)}/categories`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ categories }),
        })
        if (!res.ok) {
            const body = await res.json().catch(() => null)
            throw new Error(body?.error ?? `Save failed (${res.status})`)
        }
        emit('saved', categories)
    } catch (err) {
        errorMessage.value = err instanceof Error ? err.message : 'Failed to save categories'
    } finally {
        isSaving.value = false
    }
}

onMounted(() => document.addEventListener('keydown', handleKeydown))
onBeforeUnmount(() => document.removeEventListener('keydown', handleKeydown))
</script>

<template>
    <div class="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" role="dialog"
        aria-modal="true" :aria-label="`Edit categories for ${props.file.filename}`" @click.self="emit('close')">
        <div
            class="w-full max-w-md rounded-3xl border border-gemini-border bg-gemini-card p-6 shadow-[0_2px_8px_rgba(0,0,0,0.06)]">
            <!-- Header -->
            <div class="mb-5 flex items-start justify-between gap-4">
                <div class="flex min-w-0 items-center gap-3">
                    <span class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gemini-surface">
                        <Tags class="h-5 w-5 text-gemini-blue" />
                    </span>
                    <div class="min-w-0">
                        <h2 class="text-base font-semibold tracking-tight text-gemini-text">Edit categories</h2>
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

            <!-- Mime-derived default memberships -->
            <p v-if="defaultLabels.length" class="mb-3 text-xs text-gemini-subtext">
                Included by file type: <span class="font-medium text-gemini-text">{{ defaultLabels.join(', ') }}</span>
            </p>

            <!-- Category bubbles -->
            <div class="flex flex-wrap gap-2">
                <button v-for="cat in selectableCategories" :key="cat.id" type="button"
                    class="flex cursor-pointer items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition-all"
                    :class="selected.has(cat.id as SelectableLibraryId)
                        ? 'border-gemini-blue bg-gemini-blue/10 text-gemini-blue shadow-[0_0_16px_rgba(26,115,232,0.35)]'
                        : 'border-gemini-border bg-gemini-card text-gemini-subtext hover:border-gemini-subtext/40 hover:text-gemini-text'"
                    :aria-pressed="selected.has(cat.id as SelectableLibraryId)"
                    @click="toggle(cat.id as SelectableLibraryId)">
                    <component :is="cat.icon" class="h-4 w-4" />
                    <span>{{ cat.label }}</span>
                    <Check v-if="selected.has(cat.id as SelectableLibraryId)" class="h-3.5 w-3.5" />
                </button>
            </div>

            <p class="mt-3 text-xs leading-relaxed text-gemini-subtext">
                Tagged categories are added on top of the file type defaults. Select none to keep only the defaults.
            </p>

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
