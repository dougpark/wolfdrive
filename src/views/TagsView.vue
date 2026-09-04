<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { Check, Pencil, Tag as TagIcon, Trash2, X } from 'lucide-vue-next'
import { useTags } from '@/composables/useTags'

const router = useRouter()
const { allTags, isLoading, fetchTags, renameTag, deleteTag } = useTags()

const editingId = ref<string | null>(null)
const editingName = ref('')
const deletingId = ref<string | null>(null)

function startRename(id: string, name: string) {
    editingId.value = id
    editingName.value = name
}

async function confirmRename() {
    if (!editingId.value) return
    const name = editingName.value.trim()
    if (name) await renameTag(editingId.value, name)
    editingId.value = null
}

async function confirmDelete(id: string) {
    await deleteTag(id)
    deletingId.value = null
}

function viewFiles(tagId: string) {
    router.push({ path: '/files', query: { tags: tagId } })
}

fetchTags()
</script>

<template>
    <div class="bg-gemini-bg text-gemini-text transition-colors duration-200">
        <main class="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6 lg:px-8">
            <div class="mb-8 flex items-center gap-3">
                <span class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gemini-surface">
                    <TagIcon class="h-5 w-5 text-gemini-blue" />
                </span>
                <div>
                    <h1 class="text-xl font-semibold tracking-tight text-gemini-text">Manage Tags</h1>
                    <p class="text-sm text-gemini-subtext">Rename, delete, and review tag usage across your library.</p>
                </div>
            </div>

            <div v-if="isLoading && !allTags.length" class="space-y-2">
                <div v-for="n in 6" :key="n" class="h-14 animate-pulse rounded-xl bg-gemini-card"></div>
            </div>

            <div v-else-if="!allTags.length"
                class="rounded-3xl border border-dashed border-gemini-border bg-gemini-card p-8 text-center">
                <TagIcon class="mx-auto mb-3 h-10 w-10 text-gemini-subtext opacity-60" />
                <h3 class="text-base font-semibold text-gemini-text">No tags yet</h3>
                <p class="mt-1 text-sm text-gemini-subtext">
                    Add tags to files from the row action menu in any file list.
                </p>
            </div>

            <div v-else class="divide-y divide-gemini-border rounded-2xl border border-gemini-border bg-gemini-card">
                <div v-for="tag in allTags" :key="tag.id" class="flex items-center gap-3 px-5 py-3.5">
                    <template v-if="editingId === tag.id">
                        <input v-model="editingName" type="text" autofocus
                            class="min-w-0 flex-1 rounded-lg border border-gemini-blue bg-gemini-card px-3 py-1.5 text-sm text-gemini-text focus:outline-none"
                            @keydown.enter="confirmRename" @keydown.esc="editingId = null" />
                        <button type="button"
                            class="cursor-pointer rounded-lg p-2 text-gemini-blue transition-colors hover:bg-gemini-surface"
                            aria-label="Confirm rename" @click="confirmRename">
                            <Check class="h-4 w-4" />
                        </button>
                        <button type="button"
                            class="cursor-pointer rounded-lg p-2 text-gemini-subtext transition-colors hover:bg-gemini-surface"
                            aria-label="Cancel rename" @click="editingId = null">
                            <X class="h-4 w-4" />
                        </button>
                    </template>
                    <template v-else>
                        <button type="button"
                            class="min-w-0 flex-1 cursor-pointer truncate text-left text-sm font-medium text-gemini-text hover:text-gemini-blue"
                            @click="viewFiles(tag.id)">
                            {{ tag.name }}
                        </button>
                        <span class="shrink-0 font-mono text-xs text-gemini-subtext">
                            {{ tag.fileCount }} {{ tag.fileCount === 1 ? 'file' : 'files' }}
                        </span>
                        <button type="button"
                            class="cursor-pointer rounded-lg p-2 text-gemini-subtext transition-colors hover:bg-gemini-surface hover:text-gemini-blue"
                            aria-label="Rename tag" @click="startRename(tag.id, tag.name)">
                            <Pencil class="h-4 w-4" />
                        </button>
                        <button v-if="deletingId !== tag.id" type="button"
                            class="cursor-pointer rounded-lg p-2 text-gemini-subtext transition-colors hover:bg-gemini-surface hover:text-red-500"
                            aria-label="Delete tag" @click="deletingId = tag.id">
                            <Trash2 class="h-4 w-4" />
                        </button>
                        <template v-else>
                            <span class="text-xs text-gemini-subtext">Delete?</span>
                            <button type="button"
                                class="cursor-pointer rounded-lg px-2 py-1 text-xs font-medium text-red-500 hover:bg-red-500/10"
                                @click="confirmDelete(tag.id)">
                                Yes
                            </button>
                            <button type="button"
                                class="cursor-pointer rounded-lg px-2 py-1 text-xs font-medium text-gemini-subtext hover:bg-gemini-surface"
                                @click="deletingId = null">
                                No
                            </button>
                        </template>
                    </template>
                </div>
            </div>
        </main>
    </div>
</template>
