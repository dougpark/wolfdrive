<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { Check, Minus, Tags, X } from 'lucide-vue-next'
import { LIBRARY_CATEGORIES } from '@/config/libraryCategories'
import { SELECTABLE_LIBRARY_IDS, type SelectableLibraryId } from '@/config/libraryCategoryData'

const props = defineProps<{
    fileIds: string[]
}>()

const emit = defineEmits<{
    (e: 'close'): void
    /** Fired after any category is added/removed so the caller can refresh the file list. */
    (e: 'changed'): void
}>()

const selectableCategories = SELECTABLE_LIBRARY_IDS.map((id) => LIBRARY_CATEGORIES[id])

/** categoryId -> number of selected files that currently have it. */
const usage = ref<Map<string, number>>(new Map())
const pendingIds = ref<Set<string>>(new Set())
const isLoading = ref(true)
const errorMessage = ref('')

type CategoryStatus = 'all' | 'some' | 'none'

function statusFor(categoryId: string): CategoryStatus {
    const count = usage.value.get(categoryId) ?? 0
    if (count === 0) return 'none'
    return count === props.fileIds.length ? 'all' : 'some'
}

async function fetchUsage() {
    isLoading.value = true
    try {
        const res = await fetch(`/api/files/categories/usage?ids=${props.fileIds.map(encodeURIComponent).join(',')}`)
        if (res.ok) {
            const counts = await res.json() as Record<string, number>
            usage.value = new Map(Object.entries(counts))
        }
    } catch (err) {
        console.error('Failed to load batch category usage:', err)
    } finally {
        isLoading.value = false
    }
}

/** Adds the category to every selected file that doesn't already have it, or removes it from all. */
async function toggleCategory(categoryId: SelectableLibraryId) {
    if (pendingIds.value.has(categoryId)) return
    const status = statusFor(categoryId)
    const action = status === 'none' ? 'add' : 'remove'

    pendingIds.value = new Set(pendingIds.value).add(categoryId)
    errorMessage.value = ''
    try {
        const res = await fetch(`/api/files/categories/${action}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ fileIds: props.fileIds, categoryId }),
        })
        if (!res.ok) {
            const body = await res.json().catch(() => null)
            throw new Error(body?.error ?? `Failed to ${action} category`)
        }
        const next = new Map(usage.value)
        next.set(categoryId, action === 'add' ? props.fileIds.length : 0)
        usage.value = next
        emit('changed')
    } catch (err) {
        errorMessage.value = err instanceof Error ? err.message : `Failed to ${action} category`
    } finally {
        const next = new Set(pendingIds.value)
        next.delete(categoryId)
        pendingIds.value = next
    }
}

function handleKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape') emit('close')
}

onMounted(() => {
    fetchUsage()
    document.addEventListener('keydown', handleKeydown)
})
onBeforeUnmount(() => document.removeEventListener('keydown', handleKeydown))
</script>

<template>
    <div class="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" role="dialog"
        aria-modal="true" :aria-label="`Manage categories for ${props.fileIds.length} files`"
        @click.self="emit('close')">
        <div
            class="w-full max-w-md rounded-3xl border border-gemini-border bg-gemini-card p-6 shadow-[0_2px_8px_rgba(0,0,0,0.06)]">
            <!-- Header -->
            <div class="mb-5 flex items-start justify-between gap-4">
                <div class="flex min-w-0 items-center gap-3">
                    <span class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gemini-surface">
                        <Tags class="h-5 w-5 text-gemini-blue" />
                    </span>
                    <div class="min-w-0">
                        <h2 class="text-base font-semibold tracking-tight text-gemini-text">Manage categories</h2>
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

            <p class="mb-3 text-xs leading-relaxed text-gemini-subtext">
                A checked category is applied to every selected file. A dash means only some of the selected files
                have it — click to remove it from all of them.
            </p>

            <!-- Category list -->
            <div class="max-h-64 overflow-y-auto rounded-xl border border-gemini-border">
                <p v-if="isLoading" class="px-3 py-4 text-center text-xs text-gemini-subtext">Loading categories…</p>
                <button v-for="cat in selectableCategories" v-else :key="cat.id" type="button"
                    :disabled="pendingIds.has(cat.id)"
                    class="flex w-full cursor-pointer items-center gap-3 px-3 py-2.5 text-left text-sm transition-colors hover:bg-gemini-surface disabled:cursor-wait disabled:opacity-60"
                    @click="toggleCategory(cat.id as SelectableLibraryId)">
                    <span class="flex h-4 w-4 shrink-0 items-center justify-center rounded border" :class="statusFor(cat.id) === 'none'
                        ? 'border-gemini-border'
                        : 'border-gemini-blue bg-gemini-blue text-white'">
                        <Check v-if="statusFor(cat.id) === 'all'" class="h-3 w-3" />
                        <Minus v-else-if="statusFor(cat.id) === 'some'" class="h-3 w-3" />
                    </span>
                    <component :is="cat.icon" class="h-4 w-4 shrink-0 text-gemini-subtext" />
                    <span class="truncate text-gemini-text">{{ cat.label }}</span>
                </button>
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
