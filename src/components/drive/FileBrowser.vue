<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useTheme } from '@/composables/useTheme'
import { useFilePreview } from '@/composables/useFilePreview'
import FileActionsMenu from '@/components/common/FileActionsMenu.vue'
import FilePreviewOverlay from '@/components/viewers/FilePreviewOverlay.vue'
import type { MediaFile } from '@/types/media'
import {
    LIBRARY_CATEGORIES,
    MEDIA_FILTERS,
    getCategoryIcon,
    type LibraryCategoryId,
} from '@/config/libraryCategories'
import { Search, Grid, List as ListIcon, Filter, Eye, ArrowUp, ArrowDown } from 'lucide-vue-next'

const props = withDefaults(defineProps<{ library?: LibraryCategoryId }>(), {
    library: 'files',
})

type SortKey = 'name' | 'type' | 'modified' | 'size'

const SORT_COLUMNS: { key: SortKey; label: string; class: string }[] = [
    { key: 'type', label: 'Type', class: 'w-12 text-right' },
    { key: 'modified', label: 'Date Modified', class: 'hidden sm:block w-24 text-right' },
    { key: 'size', label: 'Size', class: 'w-20 text-right' },
]

const library = computed(() => LIBRARY_CATEGORIES[props.library])
/** The Files view is unfiltered, so it gets the media-type filter chips. */
const showFilters = computed(() => library.value.categories.length === 0)
const showHeader = computed(() => !showFilters.value)

const files = ref<MediaFile[]>([])
const categoryCounts = ref<Record<string, number>>({})
const isLoading = ref(true)
const searchQuery = ref('')
const selectedFilter = ref<string>('all')
const viewMode = ref<'grid' | 'list'>('list')
const sortKey = ref<SortKey>('modified')
const sortDirection = ref<'asc' | 'desc'>('desc')
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

/** Categories sent to the API: the library filter, narrowed by the chip selection. */
const activeCategories = computed(() => {
    if (!showFilters.value) return [...library.value.categories]
    return selectedFilter.value === 'all' ? [] : [selectedFilter.value]
})

const totalFileCount = computed(() =>
    Object.values(categoryCounts.value).reduce((a, b) => a + b, 0),
)

const activeCount = computed(() => {
    if (activeCategories.value.length === 0) return totalFileCount.value
    return activeCategories.value.reduce((sum, id) => sum + (categoryCounts.value[id] || 0), 0)
})

const scopeLabel = computed(() =>
    showFilters.value ? selectedFilter.value : library.value.label.toLowerCase(),
)

async function fetchStats() {
    try {
        const res = await fetch('/api/stats')
        if (res.ok) categoryCounts.value = await res.json()
    } catch (err) {
        console.error('Failed to load category stats:', err)
    }
}

async function fetchFiles() {
    isLoading.value = true
    try {
        const params = new URLSearchParams()
        if (activeCategories.value.length) params.append('category', activeCategories.value.join(','))
        if (searchQuery.value.trim()) params.append('search', searchQuery.value.trim())
        params.append('sort', sortKey.value)
        params.append('dir', sortDirection.value)
        params.append('limit', '1000')

        const res = await fetch(`/api/files?${params.toString()}`)
        files.value = await res.json()
    } catch (err) {
        console.error('Failed to load files:', err)
    } finally {
        isLoading.value = false
    }
}

function formatBytes(bytes: number) {
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
}

const dateFormatter = new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: '2-digit',
    year: 'numeric',
})

function formatDate(mtimeMs: number) {
    if (!mtimeMs) return '—'
    return dateFormatter.format(new Date(mtimeMs))
}

function formatCount(count: number | undefined) {
    if (!count) return '0'
    if (count >= 1000) return `${(count / 1000).toFixed(1)}k`
    return count.toLocaleString()
}

function getFilterCount(filterId: string) {
    return filterId === 'all' ? totalFileCount.value : categoryCounts.value[filterId]
}

function toggleSort(key: SortKey) {
    if (sortKey.value === key) {
        sortDirection.value = sortDirection.value === 'asc' ? 'desc' : 'asc'
    } else {
        sortKey.value = key
        sortDirection.value = key === 'name' || key === 'type' ? 'asc' : 'desc'
    }
    fetchFiles()
}

let searchTimeout: ReturnType<typeof setTimeout>
watch(searchQuery, () => {
    clearTimeout(searchTimeout)
    searchTimeout = setTimeout(() => fetchFiles(), 300)
})

watch(
    () => props.library,
    () => {
        selectedFilter.value = 'all'
        fetchFiles()
    },
)

watch(selectedFilter, fetchFiles)

onMounted(() => {
    fetchStats()
    fetchFiles()
})
</script>

<template>
    <div class="bg-gemini-bg text-gemini-text transition-colors duration-200">
        <main class="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8">

            <header v-if="showHeader" class="mb-6">
                <h1 class="text-2xl font-semibold tracking-tight text-gemini-text">{{ library.label }}</h1>
                <p class="mt-1 text-sm leading-relaxed text-gemini-subtext">{{ library.description }}</p>
            </header>

            <!-- Top Bar: Search & View Toggles -->
            <div class="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 mb-8">

                <div class="relative flex-1 max-w-lg">
                    <Search class="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gemini-subtext" />
                    <input v-model="searchQuery" type="text" :placeholder="`Search ${library.label.toLowerCase()}...`"
                        class="w-full bg-gemini-card border border-gemini-border rounded-xl pl-10 pr-4 py-2.5 text-sm text-gemini-text placeholder:text-gemini-subtext focus:outline-none focus:border-gemini-blue transition-colors" />
                </div>

                <div
                    class="flex items-center gap-1 bg-gemini-card border border-gemini-border rounded-xl p-1 self-end sm:self-auto">
                    <button @click="viewMode = 'grid'" class="p-2 rounded-lg transition-colors cursor-pointer"
                        :class="viewMode === 'grid' ? 'bg-gemini-surface text-gemini-blue' : 'text-gemini-subtext hover:text-gemini-text'"
                        title="Grid View">
                        <Grid class="h-4 w-4" />
                    </button>
                    <button @click="viewMode = 'list'" class="p-2 rounded-lg transition-colors cursor-pointer"
                        :class="viewMode === 'list' ? 'bg-gemini-surface text-gemini-blue' : 'text-gemini-subtext hover:text-gemini-text'"
                        title="List View">
                        <ListIcon class="h-4 w-4" />
                    </button>
                </div>
            </div>

            <!-- Quick media-type filters for the unfiltered Files view -->
            <div v-if="showFilters" class="mb-3 flex items-center gap-2 overflow-x-auto pb-4 no-scrollbar">
                <button v-for="filter in MEDIA_FILTERS" :key="filter.id" type="button"
                    class="flex shrink-0 cursor-pointer items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-medium transition-all"
                    :class="selectedFilter === filter.id
                        ? 'border border-gemini-blue/30 bg-gemini-surface text-gemini-blue shadow-xs'
                        : 'border border-gemini-border bg-gemini-card text-gemini-subtext hover:border-gemini-subtext/40 hover:text-gemini-text'"
                    @click="selectedFilter = filter.id">
                    <component :is="filter.icon" class="h-4 w-4" />
                    <span>{{ filter.label }}</span>
                    <span class="rounded-md px-1.5 py-0.5 font-mono text-xs transition-colors"
                        :class="selectedFilter === filter.id ? 'bg-gemini-blue/15 font-semibold text-gemini-blue' : 'bg-gemini-surface/80 text-gemini-subtext/70'">
                        {{ formatCount(getFilterCount(filter.id)) }}
                    </span>
                </button>
            </div>

            <!-- Contextual Count Subheader -->
            <div class="flex items-center justify-between text-xs text-gemini-subtext mb-5 px-1 font-medium">
                <div>
                    <span v-if="searchQuery.trim()">
                        Found <strong class="text-gemini-text font-semibold">{{ files.length.toLocaleString()
                            }}</strong> results
                        <span v-if="activeCategories.length"> in {{ scopeLabel }}</span>
                        for "<span class="italic text-gemini-text">{{ searchQuery }}</span>"
                    </span>
                    <span v-else-if="activeCategories.length">
                        <strong class="text-gemini-text font-semibold">{{ activeCount.toLocaleString() }}</strong>
                        {{ scopeLabel }} files
                    </span>
                    <span v-else>
                        <strong class="text-gemini-text font-semibold">{{ totalFileCount.toLocaleString() }}</strong>
                        total
                        indexed files
                    </span>
                </div>

                <span v-if="files.length >= 1000" class="text-amber-500 font-mono text-[11px]">
                    (Capped at 1000 items)
                </span>
            </div>

            <!-- Loading Skeleton -->
            <div v-if="isLoading" class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                <div v-for="n in 10" :key="n"
                    class="bg-gemini-card border border-gemini-border rounded-xl p-4 h-36 animate-pulse"></div>
            </div>

            <!-- Empty State -->
            <div v-else-if="files.length === 0"
                class="text-center py-16 bg-gemini-card border border-dashed border-gemini-border rounded-3xl p-8">
                <Filter class="h-10 w-10 text-gemini-subtext mx-auto mb-3 opacity-60" />
                <h3 class="text-base font-semibold text-gemini-text">No files found</h3>
                <p class="text-sm text-gemini-subtext mt-1">Try adjusting your search terms or scan additional folders
                    in
                    Settings.</p>
            </div>

            <!-- GRID VIEW -->
            <div v-else-if="viewMode === 'grid'"
                class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                <div v-for="file in files" :key="file.id"
                    class="group bg-gemini-card border border-gemini-border hover:border-gemini-blue rounded-xl p-4 transition-all duration-200 hover:shadow-md cursor-pointer flex flex-col justify-between"
                    @dblclick="openPreview(file, files)">
                    <div
                        class="h-24 w-full bg-gemini-surface rounded-lg flex items-center justify-center mb-3 group-hover:scale-[1.02] transition-transform">
                        <component :is="getCategoryIcon(file.mediaCategory)"
                            class="h-8 w-8 text-gemini-subtext group-hover:text-gemini-blue transition-colors" />
                    </div>

                    <div class="min-w-0">
                        <span class="block text-sm font-medium text-gemini-text truncate" :title="file.filename">
                            {{ file.filename }}
                        </span>
                        <div class="flex items-center justify-between text-xs text-gemini-subtext mt-1">
                            <span class="uppercase font-mono text-[10px]">{{ file.extension }}</span>
                            <span>{{ formatBytes(file.sizeBytes) }}</span>
                        </div>
                    </div>
                </div>
            </div>

            <!-- LIST VIEW -->
            <div v-else
                class="bg-gemini-card border border-gemini-border rounded-2xl overflow-hidden divide-y divide-gemini-border">

                <!-- Column Headers -->
                <div
                    class="flex items-center justify-between bg-gemini-surface/60 px-5 py-2 text-xs font-medium text-gemini-subtext">
                    <div class="flex min-w-0 flex-1 items-center gap-3.5 pr-4">
                        <span class="h-5 w-5 shrink-0"></span>
                        <button type="button"
                            class="flex cursor-pointer items-center gap-1 transition-colors hover:text-gemini-text"
                            :class="{ 'font-semibold text-gemini-blue': sortKey === 'name' }"
                            @click="toggleSort('name')">
                            Name
                            <component v-if="sortKey === 'name'" :is="sortDirection === 'asc' ? ArrowUp : ArrowDown"
                                class="h-3 w-3" />
                        </button>
                    </div>

                    <div class="flex shrink-0 items-center gap-4">
                        <button v-for="column in SORT_COLUMNS" :key="column.key" type="button" :class="[
                            column.class,
                            sortKey === column.key ? 'font-semibold text-gemini-blue' : '',
                        ]" class="cursor-pointer transition-colors hover:text-gemini-text"
                            @click="toggleSort(column.key)">
                            <span class="inline-flex items-center gap-1">
                                {{ column.label }}
                                <component v-if="sortKey === column.key"
                                    :is="sortDirection === 'asc' ? ArrowUp : ArrowDown" class="h-3 w-3" />
                            </span>
                        </button>
                        <span class="w-4"></span>
                        <span class="w-8"></span>
                    </div>
                </div>

                <div v-for="file in files" :key="file.id"
                    class="flex items-center justify-between px-5 py-3.5 hover:bg-gemini-surface/60 transition-colors cursor-pointer"
                    @dblclick="openPreview(file, files)">
                    <div class="flex items-center gap-3.5 min-w-0 flex-1 pr-4">
                        <component :is="getCategoryIcon(file.mediaCategory)"
                            class="h-5 w-5 text-gemini-blue shrink-0" />
                        <div class="min-w-0 flex-1">
                            <span class="block text-sm font-medium text-gemini-text truncate">
                                {{ file.filename }}
                            </span>
                            <span class="block text-xs font-mono text-gemini-subtext truncate">
                                {{ file.relativePath }}
                            </span>
                        </div>
                    </div>

                    <div class="flex items-center gap-4 text-xs text-gemini-subtext shrink-0">
                        <span class="uppercase font-mono w-12 text-right">{{ file.extension }}</span>
                        <span class="hidden sm:block w-24 text-right">{{ formatDate(file.mtimeMs) }}</span>
                        <span class="w-20 text-right">{{ formatBytes(file.sizeBytes) }}</span>
                        <button type="button"
                            class="p-2 -m-2 rounded-lg text-gemini-subtext hover:bg-gemini-card hover:text-gemini-blue transition-colors cursor-pointer"
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
