<script setup lang="ts">
import { computed, defineAsyncComponent, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import Navbar from '@/components/layout/Navbar.vue'
import { MdPreview } from 'md-editor-v3'
import 'md-editor-v3/lib/preview.css'
import { useTheme } from '@/composables/useTheme'
import {
  Search,
  Grid,
  List as ListIcon,
  Image as ImageIcon,
  Film,
  Music,
  FileText,
  File,
  HardDrive,
  Filter,
  Book,     // Icon for EPUBs
  FileCode, // Icon for generic documents
  BookOpen, // Icon for PDFs
  Eye,
  X
} from 'lucide-vue-next'

interface MediaFile {
  id: string
  filename: string
  relativePath: string
  extension: string
  mimeType: string
  mediaCategory: 'image' | 'video' | 'audio' | 'pdf' | 'epub' | 'document' | 'other'
  sizeBytes: number
  mtimeMs: number
}

const EpubPreview = defineAsyncComponent(() => import('@/components/viewers/EpubPreview.vue'))

const files = ref<MediaFile[]>([])
const categoryCounts = ref<Record<string, number>>({})
const isLoading = ref(true)
const searchQuery = ref('')
const selectedCategory = ref<string>('all')
const viewMode = ref<'grid' | 'list'>('list')
const previewFile = ref<MediaFile | null>(null)
const textContent = ref('')
const isTextPreviewLoading = ref(false)
const { isDark } = useTheme()

const categories = [
  { id: 'all', label: 'All Files', icon: HardDrive },
  { id: 'image', label: 'Photos', icon: ImageIcon },
  { id: 'video', label: 'Videos', icon: Film },
  { id: 'audio', label: 'Music', icon: Music },
  { id: 'pdf', label: 'PDFs', icon: BookOpen },          // Dedicated PDF tab
  { id: 'epub', label: 'eBooks', icon: Book },           // Dedicated EPUB tab
  { id: 'document', label: 'Documents', icon: FileText },
]

async function fetchStats() {
  try {
    const res = await fetch('/api/stats')
    if (res.ok) {
      categoryCounts.value = await res.json()
    }
  } catch (err) {
    console.error('Failed to load category stats:', err)
  }
}

async function fetchFiles() {
  isLoading.value = true
  try {
    const params = new URLSearchParams()
    if (selectedCategory.value !== 'all') params.append('category', selectedCategory.value)
    if (searchQuery.value.trim()) params.append('search', searchQuery.value.trim())

    // Request up to 10,000 files per fetch
    params.append('limit', '10000')

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

function formatCount(num: number | undefined) {
  if (!num) return '0'
  if (num >= 1000) return (num / 1000).toFixed(1) + 'k'
  return num.toLocaleString()
}

const totalFileCount = computed(() => {
  return Object.values(categoryCounts.value).reduce((a, b) => a + b, 0)
})

function getCategoryCount(catId: string) {
  if (catId === 'all') return totalFileCount.value
  return categoryCounts.value[catId] || 0
}

function getCategoryIcon(category: string) {
  switch (category) {
    case 'image': return ImageIcon
    case 'video': return Film
    case 'audio': return Music
    case 'pdf': return BookOpen
    case 'epub': return Book
    case 'document': return FileText
    default: return File
  }
}

const isTextPreview = computed(() => {
  if (!previewFile.value) return false

  return previewFile.value.mimeType.startsWith('text/')
    || ['md', 'markdown', 'txt', 'json', 'csv', 'log', 'xml', 'yaml', 'yml'].includes(previewFile.value.extension.toLowerCase())
})

const isMarkdownPreview = computed(() => {
  const extension = previewFile.value?.extension.toLowerCase()
  return extension === 'md' || extension === 'markdown'
})

async function openPreview(file: MediaFile) {
  previewFile.value = file
  textContent.value = ''

  const isTextFile = file.mimeType.startsWith('text/')
    || ['md', 'markdown', 'txt', 'json', 'csv', 'log', 'xml', 'yaml', 'yml'].includes(file.extension.toLowerCase())

  if (!isTextFile) return

  isTextPreviewLoading.value = true
  try {
    const response = await fetch(`/api/stream/${file.id}`)
    if (!response.ok) throw new Error(`Preview request failed: ${response.status}`)
    textContent.value = await response.text()
  } catch (err) {
    console.error('Failed to load text preview:', err)
    textContent.value = 'Unable to load this file preview.'
  } finally {
    isTextPreviewLoading.value = false
  }
}

function closePreview() {
  previewFile.value = null
  textContent.value = ''
}

// Debounce search input
let searchTimeout: ReturnType<typeof setTimeout>
watch(searchQuery, () => {
  clearTimeout(searchTimeout)
  searchTimeout = setTimeout(() => fetchFiles(), 300)
})

watch(selectedCategory, () => {
  fetchFiles()
})

watch(previewFile, (file) => {
  document.body.style.overflow = file ? 'hidden' : ''
})

onBeforeUnmount(() => {
  document.body.style.overflow = ''
})

onMounted(() => {
  fetchStats()
  fetchFiles()
})
</script>

<template>
  <div class="min-h-screen bg-gemini-bg text-gemini-text flex flex-col transition-colors duration-200">
    <Navbar />

    <main class="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">

      <!-- Top Bar: Search & View Toggles -->
      <div class="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 mb-8">

        <!-- Search Bar -->
        <div class="relative flex-1 max-w-lg">
          <Search class="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gemini-subtext" />
          <input v-model="searchQuery" type="text" placeholder="Search indexed files..."
            class="w-full bg-gemini-card border border-gemini-border rounded-xl pl-10 pr-4 py-2.5 text-sm text-gemini-text placeholder:text-gemini-subtext focus:outline-none focus:border-gemini-blue transition-colors" />
        </div>

        <!-- View Mode Switcher -->
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

      <!-- Category Tabs -->
      <div class="flex items-center gap-2 overflow-x-auto pb-4 mb-3 no-scrollbar">
        <button v-for="cat in categories" :key="cat.id" @click="selectedCategory = cat.id"
          class="flex items-center gap-2 px-3.5 py-2 rounded-xl text-sm font-medium transition-all cursor-pointer whitespace-nowrap shrink-0"
          :class="[
            selectedCategory === cat.id
              ? 'bg-gemini-surface text-gemini-blue border border-gemini-blue/30 shadow-xs'
              : 'bg-gemini-card border border-gemini-border text-gemini-subtext hover:text-gemini-text hover:border-gemini-subtext/40'
          ]">
          <component :is="cat.icon" class="h-4 w-4" />
          <span>{{ cat.label }}</span>
          <span class="text-xs px-1.5 py-0.5 rounded-md font-mono transition-colors"
            :class="selectedCategory === cat.id ? 'bg-gemini-blue/15 text-gemini-blue font-semibold' : 'bg-gemini-surface/80 text-gemini-subtext/70'">
            {{ formatCount(getCategoryCount(cat.id)) }}
          </span>
        </button>
      </div>

      <!-- Contextual Count Subheader -->
      <div class="flex items-center justify-between text-xs text-gemini-subtext mb-5 px-1 font-medium">
        <div>
          <span v-if="searchQuery.trim()">
            Found <strong class="text-gemini-text font-semibold">{{ files.length.toLocaleString() }}</strong> results
            <span v-if="selectedCategory !== 'all'"> in {{ selectedCategory }}</span>
            for "<span class="italic text-gemini-text">{{ searchQuery }}</span>"
          </span>
          <span v-else-if="selectedCategory !== 'all'">
            Showing <strong class="text-gemini-text font-semibold">{{ (categoryCounts[selectedCategory] ||
              0).toLocaleString() }}</strong> {{ selectedCategory }} files
          </span>
          <span v-else>
            Showing <strong class="text-gemini-text font-semibold">{{ totalFileCount.toLocaleString() }}</strong> total
            indexed files
          </span>
        </div>

        <span v-if="files.length >= 10000" class="text-amber-500 font-mono text-[11px]">
          (Capped at 10,000 items)
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
        <p class="text-sm text-gemini-subtext mt-1">Try adjusting your search terms or scan additional folders in
          Settings.</p>
      </div>

      <!-- GRID VIEW -->
      <div v-else-if="viewMode === 'grid'" class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
        <div v-for="file in files" :key="file.id"
          class="group bg-gemini-card border border-gemini-border hover:border-gemini-blue rounded-xl p-4 transition-all duration-200 hover:shadow-md cursor-pointer flex flex-col justify-between">
          <!-- Thumbnail / Icon Header -->
          <div
            class="h-24 w-full bg-gemini-surface rounded-lg flex items-center justify-center mb-3 group-hover:scale-[1.02] transition-transform">
            <component :is="getCategoryIcon(file.mediaCategory)"
              class="h-8 w-8 text-gemini-subtext group-hover:text-gemini-blue transition-colors" />
          </div>

          <!-- File Info -->
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
        <div v-for="file in files" :key="file.id"
          class="flex items-center justify-between px-5 py-3.5 hover:bg-gemini-surface/60 transition-colors cursor-pointer">
          <div class="flex items-center gap-3.5 min-w-0 flex-1 pr-4">
            <component :is="getCategoryIcon(file.mediaCategory)" class="h-5 w-5 text-gemini-blue shrink-0" />
            <div class="min-w-0 flex-1">
              <span class="block text-sm font-medium text-gemini-text truncate">
                {{ file.filename }}
              </span>
              <span class="block text-xs font-mono text-gemini-subtext truncate">
                {{ file.relativePath }}
              </span>
            </div>
          </div>

          <div class="flex items-center gap-6 text-xs text-gemini-subtext shrink-0">
            <span class="uppercase font-mono w-12 text-right">{{ file.extension }}</span>
            <span class="w-20 text-right">{{ formatBytes(file.sizeBytes) }}</span>
            <button type="button"
              class="p-2 -m-2 rounded-lg text-gemini-subtext hover:bg-gemini-card hover:text-gemini-blue transition-colors cursor-pointer"
              :title="`Preview ${file.filename}`" @click.stop="openPreview(file)">
              <Eye class="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

    </main>

    <div v-if="previewFile" class="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog"
      aria-modal="true" :aria-label="`Preview ${previewFile.filename}`" @click.self="closePreview">
      <section
        class="flex h-[min(85vh,48rem)] w-full max-w-5xl flex-col overflow-hidden rounded-3xl bg-gemini-card shadow-lg">
        <header class="flex items-center justify-between gap-4 border-b border-gemini-border px-6 py-4">
          <div class="min-w-0">
            <h2 class="truncate text-base font-semibold text-gemini-text">{{ previewFile.filename }}</h2>
            <p class="truncate text-xs text-gemini-subtext">{{ previewFile.relativePath }}</p>
          </div>
          <button type="button"
            class="shrink-0 rounded-xl p-2 text-gemini-subtext hover:bg-gemini-surface hover:text-gemini-text transition-colors cursor-pointer"
            title="Close preview" @click="closePreview">
            <X class="h-5 w-5" />
          </button>
        </header>
        <div class="min-h-0 flex-1 bg-gemini-surface p-4">
          <img v-if="previewFile.mediaCategory === 'image'" :src="`/api/stream/${previewFile.id}`"
            :alt="previewFile.filename" class="h-full w-full object-contain" />
          <video v-else-if="previewFile.mediaCategory === 'video'" :src="`/api/stream/${previewFile.id}`" controls
            class="h-full w-full"></video>
          <audio v-else-if="previewFile.mediaCategory === 'audio'" :src="`/api/stream/${previewFile.id}`" controls
            class="h-full w-full"></audio>
          <div v-else-if="isMarkdownPreview" class="h-full overflow-auto overscroll-contain rounded-xl">
            <MdPreview :modelValue="textContent" :theme="isDark ? 'dark' : 'light'" />
          </div>
          <pre v-else-if="isTextPreview"
            class="h-full overflow-auto overscroll-contain rounded-xl bg-gemini-surface p-4 font-mono text-sm text-gemini-text whitespace-pre-wrap">{{ isTextPreviewLoading ? 'Loading preview...' : textContent }}</pre>
          <EpubPreview v-else-if="previewFile.mediaCategory === 'epub'" :url="`/api/stream/${previewFile.id}`"
            :isDark="isDark" />
          <iframe v-else :src="`/api/stream/${previewFile.id}`" :title="previewFile.filename"
            class="h-full w-full rounded-xl border border-gemini-border bg-gemini-card"
            style="color-scheme: light"></iframe>
        </div>
      </section>
    </div>
  </div>
</template>