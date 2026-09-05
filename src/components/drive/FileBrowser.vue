<script setup lang="ts">
import { computed, nextTick, onActivated, onDeactivated, onMounted, ref, useSlots, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useTheme } from '@/composables/useTheme'
import { useFilePreview } from '@/composables/useFilePreview'
import FileActionsMenu from '@/components/common/FileActionsMenu.vue'
import CategoryPickerModal from '@/components/common/CategoryPickerModal.vue'
import TagPickerModal from '@/components/common/TagPickerModal.vue'
import TagFilterDropdown from '@/components/common/TagFilterDropdown.vue'
import BatchTagPanel from '@/components/common/BatchTagPanel.vue'
import BatchCategoryPanel from '@/components/common/BatchCategoryPanel.vue'
import FilePreviewOverlay from '@/components/viewers/FilePreviewOverlay.vue'
import type { MediaFile } from '@/types/media'
import {
    LIBRARY_CATEGORIES,
    MEDIA_FILTERS,
    getCategoryIcon,
    type LibraryCategoryId,
} from '@/config/libraryCategories'
import { Search, Grid, List as ListIcon, Filter, Eye, ArrowUp, ArrowDown, X, CheckSquare, Square, Tags as TagsIcon, Boxes } from 'lucide-vue-next'

const props = withDefaults(defineProps<{ library?: LibraryCategoryId; scopeTagIds?: string[] }>(), {
    library: 'files',
    scopeTagIds: () => [],
})

/** Views opt into extra list-view columns by providing the column-header/column-cell slots. */
const slots = useSlots()
const hasExtraColumns = computed(() => !!slots['column-header'] && !!slots['column-cell'])

const emit = defineEmits<{
    (e: 'files-loaded', files: MediaFile[]): void
    /** Bubbled from the preview overlay when a viewer reports final progress on close. */
    (e: 'progress', payload: Record<string, unknown> & { fileId: string }): void
}>()

type SortKey = 'name' | 'type' | 'modified' | 'size'

const SORT_COLUMNS: { key: SortKey; label: string; class: string }[] = [
    { key: 'type', label: 'Type', class: 'w-12 text-right' },
    { key: 'modified', label: 'Date Modified', class: 'hidden sm:block w-24 text-right' },
    { key: 'size', label: 'Size', class: 'w-20 text-right' },
]

const library = computed(() => LIBRARY_CATEGORIES[props.library])
/** The Files view is unfiltered, so it gets the media-type filter chips. */
const showFilters = computed(() => props.library === 'files')
const showHeader = computed(() => !showFilters.value)

const files = ref<MediaFile[]>([])
const categoryCounts = ref<Record<string, number>>({})
const isLoading = ref(true)
const hasLoadedOnce = ref(false)
const searchQuery = ref('')
const selectedFilter = ref<string>('all')
const selectedTagIds = ref<Set<string>>(new Set())
const tagMatchMode = ref<'all' | 'any'>('all')
const viewMode = ref<'grid' | 'list'>('list')
const sortKey = ref<SortKey>('modified')
const sortDirection = ref<'asc' | 'desc'>('desc')
const showSkeleton = computed(() => isLoading.value && !hasLoadedOnce.value)
const router = useRouter()
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

/** True when the current view is scoped to a library or a media-type chip. */
const hasScope = computed(() => !showFilters.value || selectedFilter.value !== 'all')

const totalFileCount = computed(() =>
    Object.values(categoryCounts.value).reduce((a, b) => a + b, 0),
)

/**
 * Header count for the current scope. Library views use the fetched result size
 * because user-assigned tags change membership and /api/stats is mime-only.
 */
const scopedCount = computed(() => {
    if (!showFilters.value) return files.value.length
    return selectedFilter.value === 'all'
        ? totalFileCount.value
        : (categoryCounts.value[selectedFilter.value] || 0)
})

const scopeLabel = computed(() =>
    showFilters.value ? selectedFilter.value : library.value.label.toLowerCase(),
)

/** File currently being re-categorized, or null when the modal is closed. */
const editingFile = ref<MediaFile | null>(null)
/** File currently being re-tagged, or null when the modal is closed. */
const editingTagsFile = ref<MediaFile | null>(null)
/** Ids of files checked for batch actions. */
const selectedFileIds = ref<Set<string>>(new Set())
const isBatchTagPanelOpen = ref(false)
const isBatchCategoryPanelOpen = ref(false)
const isAllSelected = computed(() =>
    files.value.length > 0 && selectedFileIds.value.size === files.value.length,
)

function toggleFileSelection(id: string) {
    const next = new Set(selectedFileIds.value)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    selectedFileIds.value = next
}

function selectAll() {
    selectedFileIds.value = new Set(files.value.map((f) => f.id))
}

function deselectAll() {
    selectedFileIds.value = new Set()
}

async function handleCategoriesSaved() {
    editingFile.value = null
    await fetchFiles()
}

async function handleTagsSaved() {
    editingTagsFile.value = null
    await fetchFiles()
}

async function handleBatchTagsChanged() {
    await fetchFiles()
}

async function handleBatchCategoriesChanged() {
    await fetchFiles()
}

async function fetchStats() {
    try {
        const params = new URLSearchParams()
        if (props.scopeTagIds.length) {
            params.set('tags', props.scopeTagIds.join(','))
            params.set('tagMode', 'all')
        }
        const query = params.toString()
        const res = await fetch(`/api/stats${query ? `?${query}` : ''}`)
        if (res.ok) categoryCounts.value = await res.json()
    } catch (err) {
        console.error('Failed to load category stats:', err)
    }
}

async function fetchFiles() {
    isLoading.value = true
    try {
        const params = new URLSearchParams()
        // Library views filter by library id (mime defaults + user-assigned tags);
        // the unfiltered Files view narrows by media-type chip instead.
        if (!showFilters.value) {
            params.append('library', props.library)
        } else if (selectedFilter.value !== 'all') {
            params.append('category', selectedFilter.value)
        }
        if (searchQuery.value.trim()) params.append('search', searchQuery.value.trim())
        const scopedTagIds = new Set([...props.scopeTagIds, ...selectedTagIds.value])
        if (scopedTagIds.size) {
            params.append('tags', [...scopedTagIds].join(','))
            params.append('tagMode', tagMatchMode.value)
        }
        params.append('sort', sortKey.value)
        params.append('dir', sortDirection.value)
        params.append('limit', '1000')

        const res = await fetch(`/api/files?${params.toString()}`)
        files.value = await res.json()
        emit('files-loaded', files.value)
        // Drop selections for files no longer in the result set (filter/search changed).
        const visibleIds = new Set(files.value.map((f) => f.id))
        selectedFileIds.value = new Set([...selectedFileIds.value].filter((id) => visibleIds.has(id)))
    } catch (err) {
        console.error('Failed to load files:', err)
    } finally {
        isLoading.value = false
        hasLoadedOnce.value = true
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

function clearSearch() {
    if (!searchQuery.value) return
    searchQuery.value = ''
    // Cancel the debounce the watcher just queued so the refetch is immediate.
    nextTick(() => {
        clearTimeout(searchTimeout)
        fetchFiles()
    })
}

watch(
    () => props.library,
    () => {
        selectedFilter.value = 'all'
        fetchFiles()
    },
)

watch(() => props.scopeTagIds, () => {
    fetchStats()
    fetchFiles()
}, { deep: true })

watch(selectedFilter, fetchFiles)
watch(selectedTagIds, fetchFiles, { deep: true })
watch(tagMatchMode, () => {
    if (selectedTagIds.value.size) fetchFiles()
})

/** Audio files get a dedicated album playback view instead of the bare inline preview. */
function handlePreview(file: MediaFile, list: MediaFile[]) {
    if (file.mediaCategory === 'audio') {
        router.push(`/music/play/${file.id}`)
        return
    }
    openPreview(file, list)
}

// The scrollable ancestor is AppLayout's <main>, not window; found lazily since
// this component doesn't own that element. Saved/restored across keep-alive toggles.
const rootEl = ref<HTMLElement | null>(null)
let scrollParent: HTMLElement | null = null
let savedScrollTop = 0

function findScrollParent(el: HTMLElement | null): HTMLElement | null {
    let node = el?.parentElement ?? null
    while (node) {
        const overflowY = getComputedStyle(node).overflowY
        if ((overflowY === 'auto' || overflowY === 'scroll') && node.scrollHeight > node.clientHeight) return node
        node = node.parentElement
    }
    return null
}

onActivated(() => {
    if (!scrollParent) scrollParent = findScrollParent(rootEl.value)
    if (scrollParent) scrollParent.scrollTop = savedScrollTop
})

onDeactivated(() => {
    if (scrollParent) savedScrollTop = scrollParent.scrollTop
})

onMounted(() => {
    // Deep-link support: /files?tags=tag_id from the tag manager's "view files" action.
    const routeTags = useRoute().query.tags
    if (typeof routeTags === 'string') {
        selectedTagIds.value = new Set(routeTags.split(',').filter(Boolean))
    }
    fetchStats()
    fetchFiles()
})
</script>

<template>
    <div ref="rootEl" class="bg-gemini-bg text-gemini-text transition-colors duration-200">
        <main class="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8">

            <!-- Top Bar: Title, Search & View Toggles -->
            <div class="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 mb-8">

                <div class="flex flex-1 items-center gap-4 min-w-0">
                    <h1 v-if="showHeader" class="shrink-0 text-xl font-semibold tracking-tight text-gemini-text">
                        {{ library.label }}
                    </h1>

                    <div class="relative flex-1 max-w-lg">
                        <Search class="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gemini-subtext" />
                        <input v-model="searchQuery" type="text"
                            :placeholder="`Search ${library.label.toLowerCase()}...`"
                            class="w-full bg-gemini-card border border-gemini-border rounded-xl pl-10 pr-10 py-2.5 text-sm text-gemini-text placeholder:text-gemini-subtext focus:outline-none focus:border-gemini-blue transition-colors"
                            @keydown.esc="clearSearch" />
                        <button v-if="searchQuery" type="button" aria-label="Clear search" title="Clear search"
                            class="absolute right-2.5 top-1/2 -translate-y-1/2 cursor-pointer rounded-lg p-1 text-gemini-subtext transition-colors hover:bg-gemini-surface hover:text-gemini-text"
                            @click="clearSearch">
                            <X class="h-4 w-4" />
                        </button>
                    </div>
                </div>

                <div class="flex items-center gap-2 self-end sm:self-auto">
                    <div class="flex items-center gap-1 bg-gemini-card border border-gemini-border rounded-xl p-1">
                        <button type="button"
                            class="p-2 rounded-lg transition-colors cursor-pointer text-gemini-subtext hover:text-gemini-text disabled:cursor-not-allowed disabled:opacity-40"
                            :disabled="files.length === 0 || isAllSelected" title="Select all" aria-label="Select all"
                            @click="selectAll">
                            <CheckSquare class="h-4 w-4" />
                        </button>
                        <button type="button"
                            class="p-2 rounded-lg transition-colors cursor-pointer text-gemini-subtext hover:text-gemini-text disabled:cursor-not-allowed disabled:opacity-40"
                            :disabled="selectedFileIds.size === 0" title="Deselect all" aria-label="Deselect all"
                            @click="deselectAll">
                            <Square class="h-4 w-4" />
                        </button>
                    </div>

                    <TagFilterDropdown v-model:selected-ids="selectedTagIds" v-model:match-mode="tagMatchMode" />

                    <div class="flex items-center gap-1 bg-gemini-card border border-gemini-border rounded-xl p-1">
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

            <!-- Batch Action Bar -->
            <div v-if="selectedFileIds.size > 0"
                class="mb-5 flex items-center justify-between gap-4 rounded-xl border border-gemini-blue/30 bg-gemini-blue/10 px-4 py-2.5">
                <span class="text-sm font-medium text-gemini-blue">
                    {{ selectedFileIds.size }} selected
                </span>
                <div class="flex items-center gap-2">
                    <button type="button"
                        class="flex cursor-pointer items-center gap-2 rounded-lg bg-gemini-card px-3 py-1.5 text-sm font-medium text-gemini-blue border border-gemini-blue/30 transition-colors hover:bg-gemini-surface"
                        @click="isBatchCategoryPanelOpen = true">
                        <Boxes class="h-4 w-4" />
                        Manage categories
                    </button>
                    <button type="button"
                        class="flex cursor-pointer items-center gap-2 rounded-lg bg-gemini-card px-3 py-1.5 text-sm font-medium text-gemini-blue border border-gemini-blue/30 transition-colors hover:bg-gemini-surface"
                        @click="isBatchTagPanelOpen = true">
                        <TagsIcon class="h-4 w-4" />
                        Manage tags
                    </button>
                    <button type="button"
                        class="flex cursor-pointer items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-medium text-gemini-subtext transition-colors hover:text-gemini-text"
                        title="Clear selection" aria-label="Clear selection" @click="deselectAll">
                        <X class="h-4 w-4" />
                    </button>
                </div>
            </div>

            <!-- Contextual Count Subheader -->
            <div class="flex items-center justify-between text-xs text-gemini-subtext mb-5 px-1 font-medium">
                <div>
                    <span v-if="searchQuery.trim()">
                        Found <strong class="text-gemini-text font-semibold">{{ files.length.toLocaleString()
                        }}</strong> results
                        <span v-if="hasScope"> in {{ scopeLabel }}</span>
                        for "<span class="italic text-gemini-text">{{ searchQuery }}</span>"
                    </span>
                    <span v-else-if="hasScope">
                        <strong class="text-gemini-text font-semibold">{{ scopedCount.toLocaleString() }}</strong>
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

            <!-- Loading Skeleton: only before the first result set, so refetches don't flash a layout swap -->
            <div v-if="showSkeleton && viewMode === 'grid'"
                class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                <div v-for="n in 10" :key="n"
                    class="bg-gemini-card border border-gemini-border rounded-xl p-4 h-36 animate-pulse"></div>
            </div>

            <div v-else-if="showSkeleton"
                class="bg-gemini-card border border-gemini-border rounded-2xl overflow-hidden divide-y divide-gemini-border">
                <div v-for="n in 10" :key="n" class="h-[57px] animate-pulse px-5 py-3.5">
                    <div class="h-full w-1/3 rounded-lg bg-gemini-surface"></div>
                </div>
            </div>

            <!-- Empty State -->
            <div v-else-if="files.length === 0 && !isLoading"
                class="text-center py-16 bg-gemini-card border border-dashed border-gemini-border rounded-3xl p-8">
                <Filter class="h-10 w-10 text-gemini-subtext mx-auto mb-3 opacity-60" />
                <h3 class="text-base font-semibold text-gemini-text">No files found</h3>
                <p class="text-sm text-gemini-subtext mt-1">Try adjusting your search terms or scan additional folders
                    in
                    Settings.</p>
            </div>

            <!-- GRID VIEW -->
            <div v-else-if="viewMode === 'grid'"
                class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 transition-opacity duration-150"
                :class="{ 'opacity-50': isLoading }">
                <div v-for="file in files" :key="file.id"
                    class="group relative bg-gemini-card border border-gemini-border hover:border-gemini-blue rounded-xl p-4 transition-all duration-200 hover:shadow-md cursor-pointer flex flex-col justify-between"
                    @dblclick="handlePreview(file, files)">
                    <input type="checkbox" :checked="selectedFileIds.has(file.id)"
                        class="absolute left-3 top-3 z-10 h-4 w-4 cursor-pointer accent-gemini-blue"
                        :aria-label="`Select ${file.filename}`" @click.stop="toggleFileSelection(file.id)" />
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
                class="bg-gemini-card border border-gemini-border rounded-2xl overflow-hidden divide-y divide-gemini-border transition-opacity duration-150"
                :class="{ 'opacity-50': isLoading }">

                <!-- Column Headers -->
                <div
                    class="flex items-center justify-between bg-gemini-surface/60 px-5 py-2 text-xs font-medium text-gemini-subtext">
                    <div class="flex min-w-0 flex-1 items-center gap-3.5 pr-4">
                        <input type="checkbox" :checked="isAllSelected"
                            class="h-4 w-4 shrink-0 cursor-pointer accent-gemini-blue" aria-label="Select all"
                            @click="isAllSelected ? deselectAll() : selectAll()" />
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
                        <slot name="column-header"></slot>
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
                    @dblclick="handlePreview(file, files)">
                    <div class="flex items-center gap-3.5 min-w-0 flex-1 pr-4">
                        <input type="checkbox" :checked="selectedFileIds.has(file.id)"
                            class="h-4 w-4 shrink-0 cursor-pointer accent-gemini-blue"
                            :aria-label="`Select ${file.filename}`" @click.stop="toggleFileSelection(file.id)" />
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
                        <div v-if="file.tags?.length" class="hidden shrink-0 items-center gap-1 md:flex">
                            <span v-for="tag in file.tags.slice(0, 3)" :key="tag.id"
                                class="rounded-full bg-gemini-blue/10 px-2 py-0.5 text-[11px] font-medium text-gemini-blue">
                                {{ tag.name }}
                            </span>
                            <span v-if="file.tags.length > 3" class="text-[11px] text-gemini-subtext">
                                +{{ file.tags.length - 3 }}
                            </span>
                        </div>
                    </div>

                    <div class="flex items-center gap-4 text-xs text-gemini-subtext shrink-0">
                        <slot v-if="hasExtraColumns" name="column-cell" :file="file"></slot>
                        <span class="uppercase font-mono w-12 text-right">{{ file.extension }}</span>
                        <span class="hidden sm:block w-24 text-right">{{ formatDate(file.mtimeMs) }}</span>
                        <span class="w-20 text-right">{{ formatBytes(file.sizeBytes) }}</span>
                        <button type="button"
                            class="p-2 -m-2 rounded-lg text-gemini-subtext hover:bg-gemini-card hover:text-gemini-blue transition-colors cursor-pointer"
                            :title="`Preview ${file.filename}`" @click.stop="handlePreview(file, files)">
                            <Eye class="h-4 w-4" />
                        </button>
                        <FileActionsMenu :file="file" @edit-categories="editingFile = file"
                            @edit-tags="editingTagsFile = file" />
                    </div>
                </div>
            </div>

        </main>

        <FilePreviewOverlay v-if="previewFile" :file="previewFile" :is-dark="isDark" :is-markdown="isMarkdownPreview"
            :is-text="isTextPreview" :is-text-loading="isTextPreviewLoading" :text-content="textContent"
            :has-previous="hasPrevious" :has-next="hasNext" @close="closePreview" @previous="goPrevious" @next="goNext"
            @progress="(p) => emit('progress', p)" />

        <CategoryPickerModal v-if="editingFile" :file="editingFile" @close="editingFile = null"
            @saved="handleCategoriesSaved" />

        <TagPickerModal v-if="editingTagsFile" :file="editingTagsFile" @close="editingTagsFile = null"
            @saved="handleTagsSaved" />

        <BatchTagPanel v-if="isBatchTagPanelOpen" :file-ids="[...selectedFileIds]" @close="isBatchTagPanelOpen = false"
            @changed="handleBatchTagsChanged" />

        <BatchCategoryPanel v-if="isBatchCategoryPanelOpen" :file-ids="[...selectedFileIds]"
            @close="isBatchCategoryPanelOpen = false" @changed="handleBatchCategoriesChanged" />
    </div>
</template>
