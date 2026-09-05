<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { Check, ChevronDown, Tag as TagIcon, X } from 'lucide-vue-next'
import { useTags } from '@/composables/useTags'

const selectedIds = defineModel<Set<string>>('selectedIds', { required: true })
const matchMode = defineModel<'all' | 'any'>('matchMode', { required: true })

const { allTags, fetchTags } = useTags()

const isOpen = ref(false)
const query = ref('')
const rootEl = ref<HTMLElement | null>(null)

const filteredTags = computed(() => {
    const q = query.value.trim().toLowerCase()
    return q ? allTags.value.filter((t) => t.name.toLowerCase().includes(q)) : allTags.value
})

function toggle(id: string) {
    const next = new Set(selectedIds.value)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    selectedIds.value = next
}

function clearAll() {
    selectedIds.value = new Set()
}

function toggleOpen() {
    isOpen.value = !isOpen.value
    if (isOpen.value) fetchTags()
}

function handleDocumentClick(event: MouseEvent) {
    if (!rootEl.value?.contains(event.target as Node)) isOpen.value = false
}

function handleKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape') isOpen.value = false
}

onMounted(() => {
    document.addEventListener('click', handleDocumentClick)
    document.addEventListener('keydown', handleKeydown)
})
onBeforeUnmount(() => {
    document.removeEventListener('click', handleDocumentClick)
    document.removeEventListener('keydown', handleKeydown)
})
</script>

<template>
    <div ref="rootEl" class="relative inline-block">
        <button type="button"
            class="flex shrink-0 cursor-pointer items-center gap-2 rounded-xl border px-3.5 py-2 text-sm font-medium transition-all"
            :class="selectedIds.size
                ? 'border-gemini-blue/30 bg-gemini-surface text-gemini-blue shadow-xs'
                : 'border-gemini-border bg-gemini-card text-gemini-subtext hover:border-gemini-subtext/40 hover:text-gemini-text'"
            :aria-expanded="isOpen" @click="toggleOpen">
            <TagIcon class="h-4 w-4" />
            <span>Tags</span>
            <span v-if="selectedIds.size"
                class="rounded-md bg-gemini-blue/15 px-1.5 py-0.5 font-mono text-xs font-semibold text-gemini-blue">
                {{ selectedIds.size }}
            </span>
            <button v-if="selectedIds.size" type="button" aria-label="Clear tag filter" title="Clear tag filter"
                class="-mr-1 cursor-pointer rounded-md p-0.5 text-gemini-blue transition-colors hover:bg-gemini-blue/15"
                @click.stop="clearAll">
                <X class="h-3.5 w-3.5" />
            </button>
            <ChevronDown class="h-3.5 w-3.5" />
        </button>

        <div v-if="isOpen"
            class="absolute left-0 top-full z-50 mt-2 w-72 overflow-hidden rounded-xl border border-gemini-border bg-gemini-card shadow-[0_8px_24px_rgba(0,0,0,0.12)]">
            <div class="border-b border-gemini-border p-2">
                <input v-model="query" type="text" placeholder="Search tags…" autofocus
                    class="w-full rounded-lg bg-gemini-surface px-3 py-2 text-sm text-gemini-text placeholder:text-gemini-subtext focus:outline-none" />
            </div>

            <div class="max-h-64 overflow-y-auto p-1">
                <p v-if="!filteredTags.length" class="px-3 py-4 text-center text-xs text-gemini-subtext">
                    No tags found
                </p>
                <button v-for="tag in filteredTags" :key="tag.id" type="button"
                    class="flex w-full cursor-pointer items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors hover:bg-gemini-surface"
                    @click="toggle(tag.id)">
                    <span class="flex min-w-0 items-center gap-2 text-gemini-text">
                        <span class="flex h-4 w-4 shrink-0 items-center justify-center rounded border"
                            :class="selectedIds.has(tag.id) ? 'border-gemini-blue bg-gemini-blue text-white' : 'border-gemini-border'">
                            <Check v-if="selectedIds.has(tag.id)" class="h-3 w-3" />
                        </span>
                        <span class="truncate">{{ tag.name }}</span>
                    </span>
                    <span class="shrink-0 font-mono text-xs text-gemini-subtext">{{ tag.fileCount }}</span>
                </button>
            </div>

            <div class="flex items-center justify-between gap-2 border-t border-gemini-border p-2">
                <div class="flex items-center gap-1 rounded-lg bg-gemini-surface p-1 text-xs font-medium">
                    <button type="button" class="cursor-pointer rounded-md px-2 py-1 transition-colors"
                        :class="matchMode === 'all' ? 'bg-gemini-card text-gemini-blue shadow-xs' : 'text-gemini-subtext'"
                        @click="matchMode = 'all'">
                        All
                    </button>
                    <button type="button" class="cursor-pointer rounded-md px-2 py-1 transition-colors"
                        :class="matchMode === 'any' ? 'bg-gemini-card text-gemini-blue shadow-xs' : 'text-gemini-subtext'"
                        @click="matchMode = 'any'">
                        Any
                    </button>
                </div>
                <button v-if="selectedIds.size" type="button"
                    class="flex cursor-pointer items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-gemini-subtext transition-colors hover:text-gemini-text"
                    @click="clearAll">
                    <X class="h-3 w-3" />
                    Clear
                </button>
            </div>
        </div>
    </div>
</template>
