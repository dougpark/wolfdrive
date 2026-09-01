<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import { useTheme } from '@/composables/useTheme'
import { useFilePreview } from '@/composables/useFilePreview'
import FileActionsMenu from '@/components/common/FileActionsMenu.vue'
import FilePreviewOverlay from '@/components/viewers/FilePreviewOverlay.vue'
import type { MediaFile } from '@/types/media'
import { Eye, FileText, Filter, Grid, List as ListIcon, Search } from 'lucide-vue-next'

const files = ref<MediaFile[]>([])
const documentCount = ref(0)
const isLoading = ref(true)
const searchQuery = ref('')
const viewMode = ref<'grid' | 'list'>('list')
const { isDark } = useTheme()
const {
    previewFile,
    hasPrevious,
    hasNext,
    textContent,
    isTextPreviewLoading,
    isTextPreview,
    isMarkdownPreview,
    open: openPreview,
    close: closePreview,
    goNext,
    goPrevious,
} = useFilePreview()

async function fetchStats() {
    try {
        const response = await fetch('/api/stats')
        if (response.ok) {
            const stats = await response.json() as Record<string, number>
            documentCount.value = stats.document || 0
        }
    } catch (error) {
        console.error('Failed to load document stats:', error)
    }
}

async function fetchFiles() {
    isLoading.value = true
    try {
        const params = new URLSearchParams({ category: 'document', limit: '10000' })
        if (searchQuery.value.trim()) params.append('search', searchQuery.value.trim())

        const response = await fetch(`/api/files?${params.toString()}`)
        if (!response.ok) throw new Error(`Document request failed: ${response.status}`)
        files.value = await response.json()
    } catch (error) {
        console.error('Failed to load documents:', error)
        files.value = []
    } finally {
        isLoading.value = false
    }
}

function formatBytes(bytes: number) {
    if (bytes === 0) return '0 B'
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
    const index = Math.floor(Math.log(bytes) / Math.log(1024))
    return `${parseFloat((bytes / Math.pow(1024, index)).toFixed(1))} ${sizes[index]}`
}

let searchTimeout: ReturnType<typeof setTimeout>
watch(searchQuery, () => {
    clearTimeout(searchTimeout)
    searchTimeout = setTimeout(fetchFiles, 300)
})

onMounted(() => {
    fetchStats()
    fetchFiles()
})
</script>

<template>
    <div class="bg-gemini-bg text-gemini-text transition-colors duration-200">
        <main class="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
            <div class="mb-8 flex flex-col items-stretch justify-between gap-4 sm:flex-row sm:items-center">
                <div class="relative flex-1 max-w-lg">
                    <Search class="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gemini-subtext" />
                    <input v-model="searchQuery" type="text" placeholder="Search documents..."
                        class="w-full rounded-xl border border-gemini-border bg-gemini-card py-2.5 pl-10 pr-4 text-sm text-gemini-text placeholder:text-gemini-subtext focus:border-gemini-blue focus:outline-none" />
                </div>
                <div class="flex self-end rounded-xl border border-gemini-border bg-gemini-card p-1 sm:self-auto">
                    <button type="button" class="cursor-pointer rounded-lg p-2 transition-colors" title="Grid View"
                        :class="viewMode === 'grid' ? 'bg-gemini-surface text-gemini-blue' : 'text-gemini-subtext hover:text-gemini-text'"
                        @click="viewMode = 'grid'">
                        <Grid class="h-4 w-4" />
                    </button>
                    <button type="button" class="cursor-pointer rounded-lg p-2 transition-colors" title="List View"
                        :class="viewMode === 'list' ? 'bg-gemini-surface text-gemini-blue' : 'text-gemini-subtext hover:text-gemini-text'"
                        @click="viewMode = 'list'">
                        <ListIcon class="h-4 w-4" />
                    </button>
                </div>
            </div>

            <div class="mb-5 px-1 text-xs font-medium text-gemini-subtext">
                <span v-if="searchQuery.trim()">Found <strong class="font-semibold text-gemini-text">{{
                    files.length.toLocaleString() }}</strong> matching documents</span>
                <span v-else>Showing <strong class="font-semibold text-gemini-text">{{ documentCount.toLocaleString()
                }}</strong> indexed documents</span>
            </div>

            <div v-if="isLoading" class="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
                <div v-for="index in 10" :key="index"
                    class="h-36 animate-pulse rounded-xl border border-gemini-border bg-gemini-card p-4"></div>
            </div>
            <div v-else-if="files.length === 0"
                class="rounded-3xl border border-dashed border-gemini-border bg-gemini-card p-8 py-16 text-center">
                <Filter class="mx-auto mb-3 h-10 w-10 text-gemini-subtext opacity-60" />
                <h2 class="text-base font-semibold">No documents found</h2>
            </div>
            <div v-else-if="viewMode === 'grid'"
                class="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
                <button v-for="file in files" :key="file.id" type="button"
                    class="group flex cursor-pointer flex-col justify-between rounded-xl border border-gemini-border bg-gemini-card p-4 text-left transition-all hover:border-gemini-blue hover:shadow-md"
                    @dblclick="openPreview(file, files)">
                    <div class="mb-3 flex h-24 items-center justify-center rounded-lg bg-gemini-surface">
                        <FileText class="h-8 w-8 text-gemini-subtext group-hover:text-gemini-blue" />
                    </div>
                    <span class="truncate text-sm font-medium">{{ file.filename }}</span>
                    <span class="mt-1 text-xs text-gemini-subtext">{{ formatBytes(file.sizeBytes) }}</span>
                </button>
            </div>
            <div v-else
                class="divide-y divide-gemini-border overflow-hidden rounded-2xl border border-gemini-border bg-gemini-card">
                <div v-for="file in files" :key="file.id"
                    class="flex cursor-pointer items-center justify-between px-5 py-3.5 hover:bg-gemini-surface/60"
                    @dblclick="openPreview(file, files)">
                    <div class="flex min-w-0 flex-1 items-center gap-3.5 pr-4">
                        <FileText class="h-5 w-5 shrink-0 text-gemini-blue" />
                        <div class="min-w-0"><span class="block truncate text-sm font-medium">{{ file.filename
                        }}</span><span class="block truncate font-mono text-xs text-gemini-subtext">{{
                                    file.relativePath }}</span></div>
                    </div>
                    <div class="flex shrink-0 items-center gap-4 text-xs text-gemini-subtext"><span
                            class="w-12 text-right font-mono uppercase">{{ file.extension }}</span><span
                            class="w-20 text-right">{{ formatBytes(file.sizeBytes) }}</span><button type="button"
                            class="-m-2 cursor-pointer rounded-lg p-2 hover:bg-gemini-card hover:text-gemini-blue"
                            :title="`Preview ${file.filename}`" @click.stop="openPreview(file, files)">
                            <Eye class="h-4 w-4" />
                        </button>
                        <FileActionsMenu :file="file" />
                    </div>
                </div>
            </div>
        </main>

        <FilePreviewOverlay v-if="previewFile" :file="previewFile" :is-dark="isDark" :is-markdown="isMarkdownPreview"
            :is-text="isTextPreview" :is-text-loading="isTextPreviewLoading" :text-content="textContent"
            :has-previous="hasPrevious" :has-next="hasNext" @close="closePreview" @previous="goPrevious"
            @next="goNext" />
    </div>
</template>