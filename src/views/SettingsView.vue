<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from 'vue'
import { useTheme } from '@/composables/useTheme'
import {
  Palette,
  HardDrive,
  Cpu,
  User,
  Sun,
  Moon,
  Monitor,
  Check
} from 'lucide-vue-next'
import { FolderPlus, Trash2, Folder, RefreshCw } from 'lucide-vue-next'
import { FileCode, Save } from 'lucide-vue-next'
import BaseButton from '@/components/ui/BaseButton.vue'
import BaseInput from '@/components/ui/BaseInput.vue'
import FolderTagEditor from '@/components/common/FolderTagEditor.vue'
import type { Tag } from '@/types/media'

const { selectedTheme, applyTheme, initTheme } = useTheme()

// Category Definitions
type CategoryId = 'theme' | 'storage' | 'system' | 'account'

interface Category {
  id: CategoryId
  label: string
  icon: any
  description: string
}

const categories: Category[] = [
  { id: 'theme', label: 'Theme & Appearance', icon: Palette, description: 'Customize visual appearance and dark mode' },
  { id: 'storage', label: 'Storage & Indexing', icon: HardDrive, description: 'Manage local media directories and scans' },
  { id: 'system', label: 'System & Hardware', icon: Cpu, description: 'Ollama model & GPU indexing performance' },
  { id: 'account', label: 'Account & Security', icon: User, description: 'Profile settings and session management' }
]

const activeCategory = ref<CategoryId>('theme')

// Ignore Patterns State
const ignoreText = ref('')
const isSavingIgnore = ref(false)

async function fetchIgnorePatterns() {
  try {
    const res = await fetch('/api/settings/ignore')
    const patterns: string[] = await res.json()
    ignoreText.value = patterns.join('\n')
  } catch (err) {
    console.error('Failed to load ignore patterns', err)
  }
}

async function saveIgnorePatterns() {
  isSavingIgnore.value = true
  const patterns = ignoreText.value
    .split('\n')
    .map((p) => p.trim())
    .filter((p) => p.length > 0)

  try {
    await fetch('/api/settings/ignore', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ patterns }),
    })
  } finally {
    isSavingIgnore.value = false
  }
}

onMounted(() => {
  initTheme()
  fetchIgnorePatterns()
})

interface MediaDirectory {
  id: string
  path: string
  label: string | null
  enabled: boolean
  lastScannedAt: string | null
  totalFiles?: number
  breakdown?: Record<string, number>
  tags: Tag[]
}

interface ScanSchedule {
  intervalSeconds: number | null
  nextRunAt: string | null
  lastRunAt: string | null
  lastError: string | null
}

const storagePaths = ref<{ hostPath: string | null; containerPath: string | null }>({ hostPath: null, containerPath: null })
const schedule = ref<ScanSchedule | null>(null)
const intervalHours = ref('1')
const storageError = ref('')
const savingSchedule = ref(false)
const editingDirectory = ref<string | null>(null)
const editedTags = ref<Tag[]>([])
const newTags = ref<Tag[]>([])

async function fetchStorageSettings(updateInterval = true) {
  try {
    const res = await fetch('/api/settings/storage')
    if (!res.ok) throw new Error('Unable to load storage settings')
    const data = await res.json() as { hostPath: string | null; containerPath: string | null; schedule: ScanSchedule }
    storagePaths.value = { hostPath: data.hostPath, containerPath: data.containerPath }
    const previousRun = schedule.value?.lastRunAt
    schedule.value = data.schedule
    if (updateInterval && data.schedule.intervalSeconds !== null) intervalHours.value = String(data.schedule.intervalSeconds / 3600)
    if (!updateInterval && data.schedule.lastRunAt !== previousRun) await fetchDirectories()
  } catch (error) {
    storageError.value = error instanceof Error ? error.message : 'Unable to load storage settings'
  }
}

async function saveSchedule(enabled: boolean) {
  const seconds = enabled ? Number(intervalHours.value) * 3600 : null
  if (seconds !== null && (!Number.isFinite(seconds) || Math.round(seconds) < 60 || Math.round(seconds) > 31536000)) {
    storageError.value = 'Enter an interval between one minute and 365 days.'
    return
  }
  storageError.value = ''
  savingSchedule.value = true
  try {
    const res = await fetch('/api/settings/scan-schedule', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ intervalSeconds: seconds === null ? null : Math.round(seconds) }),
    })
    if (!res.ok) throw new Error('Unable to save rescan schedule')
    schedule.value = await res.json()
  } catch (error) {
    storageError.value = error instanceof Error ? error.message : 'Unable to save rescan schedule'
  } finally {
    savingSchedule.value = false
  }
}

function editTags(dir: MediaDirectory) {
  editingDirectory.value = dir.id
  editedTags.value = [...dir.tags]
}

async function saveFolderTags(id: string) {
  storageError.value = ''
  try {
    const res = await fetch(`/api/directories/${encodeURIComponent(id)}/tags`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tagIds: editedTags.value.map((tag) => tag.id) }),
    })
    if (!res.ok) throw new Error('Unable to save folder tags')
    editingDirectory.value = null
    await fetchDirectories()
  } catch (error) {
    storageError.value = error instanceof Error ? error.message : 'Unable to save folder tags'
  }
}

// Category labels for badges
const categoryLabels: Record<string, string> = {
  image: 'Photos',
  video: 'Videos',
  audio: 'Music',
  pdf: 'PDFs',
  epub: 'eBooks',
  document: 'Docs',
  other: 'Other'
}

const directories = ref<MediaDirectory[]>([])
const newPath = ref('')
const newLabel = ref('')
const isLoading = ref(false)
const isScanning = ref<Record<string, boolean>>({})
const isScanningAll = ref(false)

async function fetchDirectories() {
  try {
    const res = await fetch('/api/directories')
    if (!res.ok) throw new Error('Unable to load monitored folders')
    directories.value = await res.json()
  } catch (err) {
    console.error('Failed to load directories', err)
    storageError.value = 'Unable to load monitored folders.'
  }
}

async function addDirectory() {
  if (!newPath.value.trim()) return
  isLoading.value = true
  storageError.value = ''

  try {
    const res = await fetch('/api/directories', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: newPath.value, label: newLabel.value, tagIds: newTags.value.map((tag) => tag.id) })
    })

    if (res.ok) {
      newPath.value = ''
      newLabel.value = ''
      newTags.value = []
      await fetchDirectories()
    } else throw new Error('Unable to add monitored folder')
  } catch (error) {
    storageError.value = error instanceof Error ? error.message : 'Unable to add monitored folder'
  } finally {
    isLoading.value = false
  }
}

async function removeDirectory(id: string) {
  storageError.value = ''
  try {
    const res = await fetch('/api/directories/' + encodeURIComponent(id), { method: 'DELETE' })
    if (!res.ok) throw new Error('Unable to remove monitored folder')
    await fetchDirectories()
  } catch (error) {
    storageError.value = error instanceof Error ? error.message : 'Unable to remove monitored folder'
  }
}

// Scan all user directories
async function triggerScanAll() {
  if (isScanningAll.value) return
  isScanningAll.value = true

  try {
    const res = await fetch('/api/scan', { method: 'POST' })
    if (!res.ok) throw new Error(`Scan failed (${res.status})`)
    const data = await res.json()
    console.log(`Scan completed: ${data.totalIndexed} indexed, ${data.totalSkipped} skipped, ${data.totalPruned} stale entries removed.`)
    await fetchDirectories()
  } catch (err) {
    console.error('Scan failed', err)
    storageError.value = err instanceof Error ? err.message : 'Scan failed'
  } finally {
    isScanningAll.value = false
  }
}

// Scan a specific directory
async function triggerSingleScan(id: string) {
  if (isScanning.value[id]) return
  isScanning.value[id] = true

  try {
    const res = await fetch(`/api/scan/${id}`, { method: 'POST' })
    if (!res.ok) throw new Error(`Scan failed (${res.status})`)
    await fetchDirectories()
  } catch (err) {
    console.error('Directory scan failed', err)
    storageError.value = err instanceof Error ? err.message : 'Directory scan failed'
  } finally {
    isScanning.value[id] = false
  }
}

function formatDate(isoStr: string | null) {
  if (!isoStr) return 'Never scanned'
  return new Date(isoStr).toLocaleString()
}

let storageTimer: ReturnType<typeof setInterval>
onMounted(() => {
  fetchDirectories()
  fetchStorageSettings()
  storageTimer = setInterval(() => {
    if (activeCategory.value === 'storage' && !savingSchedule.value) void fetchStorageSettings(false)
  }, 15000)
})
onBeforeUnmount(() => clearInterval(storageTimer))
</script>

<template>
  <div class="min-h-screen bg-gemini-bg text-gemini-text flex flex-col transition-colors duration-200">
    <!-- Settings Main Container -->
    <main class="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <!-- Header -->
      <div class="mb-8">
        <h1 class="text-3xl font-semibold tracking-tight text-gemini-text">
          Settings
        </h1>
        <p class="text-base text-gemini-subtext mt-1">
          Manage your app preferences, media indexing configurations, and interface options.
        </p>
      </div>

      <!-- Two-Column Grid Layout -->
      <div class="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">

        <!-- Left Column: Categories Navigation -->
        <aside class="lg:col-span-4 xl:col-span-3">
          <nav class="bg-gemini-card border border-gemini-border rounded-3xl p-3 shadow-sm space-y-1">
            <button v-for="cat in categories" :key="cat.id" @click="activeCategory = cat.id"
              class="w-full flex items-center gap-3.5 px-4 py-3 rounded-xl text-sm font-medium transition-all text-left cursor-pointer"
              :class="[
                activeCategory === cat.id
                  ? 'bg-gemini-surface text-gemini-blue font-semibold shadow-xs'
                  : 'text-gemini-subtext hover:bg-gemini-surface/60 hover:text-gemini-text'
              ]">
              <component :is="cat.icon" class="h-5 w-5 shrink-0"
                :class="activeCategory === cat.id ? 'text-gemini-blue' : 'text-gemini-subtext'" />
              <span class="truncate">{{ cat.label }}</span>
            </button>
          </nav>
        </aside>

        <!-- Right Column: Settings Panel -->
        <section class="lg:col-span-8 xl:col-span-9">
          <div
            class="bg-gemini-card border border-gemini-border rounded-3xl p-6 sm:p-8 shadow-sm transition-colors duration-200">

            <!-- Category: Theme & Appearance -->
            <div v-if="activeCategory === 'theme'" class="space-y-6">
              <div>
                <h2 class="text-xl font-semibold text-gemini-text">Theme & Appearance</h2>
                <p class="text-sm text-gemini-subtext mt-1">
                  Choose how WolfDrive appears on your screen. Select a light or dark theme, or sync with your system
                  display preference.
                </p>
              </div>

              <hr class="border-gemini-border" />

              <!-- Theme Cards Selection Grid -->
              <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <!-- Light Theme Option -->
                <button @click="applyTheme('light')"
                  class="group relative flex flex-col items-center justify-between p-5 rounded-2xl border text-center transition-all cursor-pointer"
                  :class="[
                    selectedTheme === 'light'
                      ? 'border-gemini-blue bg-gemini-surface ring-2 ring-gemini-blue/20'
                      : 'border-gemini-border bg-gemini-card hover:border-gemini-subtext/40 hover:bg-gemini-surface/40'
                  ]">
                  <div
                    class="flex items-center justify-center h-12 w-12 rounded-full bg-amber-100 text-amber-600 dark:bg-amber-950/60 dark:text-amber-400 mb-4 transition-transform group-hover:scale-105">
                    <Sun class="h-6 w-6" />
                  </div>
                  <div class="space-y-1">
                    <span class="block text-base font-medium text-gemini-text">Light Mode</span>
                    <span class="block text-xs text-gemini-subtext">Bright and high-contrast interface</span>
                  </div>
                  <div v-if="selectedTheme === 'light'"
                    class="absolute top-3 right-3 h-5 w-5 rounded-full bg-gemini-blue text-white flex items-center justify-center">
                    <Check class="h-3.5 w-3.5 stroke-3" />
                  </div>
                </button>

                <!-- Dark Theme Option -->
                <button @click="applyTheme('dark')"
                  class="group relative flex flex-col items-center justify-between p-5 rounded-2xl border text-center transition-all cursor-pointer"
                  :class="[
                    selectedTheme === 'dark'
                      ? 'border-gemini-blue bg-gemini-surface ring-2 ring-gemini-blue/20'
                      : 'border-gemini-border bg-gemini-card hover:border-gemini-subtext/40 hover:bg-gemini-surface/40'
                  ]">
                  <div
                    class="flex items-center justify-center h-12 w-12 rounded-full bg-indigo-100 text-indigo-600 dark:bg-indigo-950/60 dark:text-indigo-400 mb-4 transition-transform group-hover:scale-105">
                    <Moon class="h-6 w-6" />
                  </div>
                  <div class="space-y-1">
                    <span class="block text-base font-medium text-gemini-text">Dark Mode</span>
                    <span class="block text-xs text-gemini-subtext">Reduced glare for low light</span>
                  </div>
                  <div v-if="selectedTheme === 'dark'"
                    class="absolute top-3 right-3 h-5 w-5 rounded-full bg-gemini-blue text-white flex items-center justify-center">
                    <Check class="h-3.5 w-3.5 stroke-3" />
                  </div>
                </button>

                <!-- System Theme Option -->
                <button @click="applyTheme('system')"
                  class="group relative flex flex-col items-center justify-between p-5 rounded-2xl border text-center transition-all cursor-pointer"
                  :class="[
                    selectedTheme === 'system'
                      ? 'border-gemini-blue bg-gemini-surface ring-2 ring-gemini-blue/20'
                      : 'border-gemini-border bg-gemini-card hover:border-gemini-subtext/40 hover:bg-gemini-surface/40'
                  ]">
                  <div
                    class="flex items-center justify-center h-12 w-12 rounded-full bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-200 mb-4 transition-transform group-hover:scale-105">
                    <Monitor class="h-6 w-6" />
                  </div>
                  <div class="space-y-1">
                    <span class="block text-base font-medium text-gemini-text">System Default</span>
                    <span class="block text-xs text-gemini-subtext">Sync with OS theme settings</span>
                  </div>
                  <div v-if="selectedTheme === 'system'"
                    class="absolute top-3 right-3 h-5 w-5 rounded-full bg-gemini-blue text-white flex items-center justify-center">
                    <Check class="h-3.5 w-3.5 stroke-3" />
                  </div>
                </button>
              </div>
            </div>

            <!-- Placeholder Panels for Future Settings -->

            <!-- Beginning of storage section -->
            <!-- Category: Storage & Indexing -->
            <div v-if="activeCategory === 'storage'" class="space-y-6">
              <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h2 class="text-xl font-semibold text-gemini-text">Storage & Media Directories</h2>
                  <p class="text-sm text-gemini-subtext mt-1">
                    Configure host file system directories to index photos, videos, audio, and documents.
                  </p>
                </div>

                <!-- Global Rescan All Button -->
                <button @click="triggerScanAll" :disabled="isScanningAll || directories.length === 0"
                  class="bg-gemini-surface border border-gemini-border text-gemini-text rounded-xl px-4 py-2 text-sm font-medium hover:bg-gemini-card transition-colors flex items-center justify-center gap-2 cursor-pointer shrink-0 disabled:opacity-50">
                  <RefreshCw class="h-4 w-4 text-gemini-blue" :class="{ 'animate-spin': isScanningAll }" />
                  <span>{{ isScanningAll ? 'Scanning All...' : 'Rescan All Folders Now' }}</span>
                </button>
              </div>

              <hr class="border-gemini-border" />

              <p v-if="storageError" role="alert" class="text-sm text-gemini-text">{{ storageError }}</p>
              <div class="bg-gemini-surface p-4 rounded-xl space-y-1 text-sm">
                <p>Host storage path (informational): <span class="font-mono">{{ storagePaths.hostPath || 'Not configured' }}</span></p>
                <p>Container storage path: <span class="font-mono">{{ storagePaths.containerPath || 'Not configured' }}</span></p>
                <p class="text-gemini-subtext">Enter paths visible to the WolfDrive server, such as the container path above.</p>
              </div>

              <div class="bg-gemini-surface p-4 rounded-xl space-y-3">
                <h3 class="text-sm font-semibold">Automatic rescans</h3>
                <p class="text-sm text-gemini-subtext">A global elapsed interval for rescans and future AI processing. AI generation is not yet available.</p>
                <div class="flex flex-wrap items-center gap-2">
                  <label for="scan-hours" class="text-sm">Interval in hours</label>
                  <BaseInput id="scan-hours" v-model="intervalHours" type="number" min="0" step="any" class="max-w-32" />
                  <BaseButton variant="primary" :disabled="savingSchedule || !schedule" @click="saveSchedule(true)">Save and enable</BaseButton>
                  <BaseButton :disabled="savingSchedule || !schedule || schedule.intervalSeconds === null" @click="saveSchedule(false)">Disable</BaseButton>
                </div>
                <p class="text-sm text-gemini-subtext">
                  {{ schedule?.nextRunAt ? `Next scan: ${formatDate(schedule.nextRunAt)}` : 'Automatic rescans are disabled.' }}
                </p>
                <p v-if="schedule?.lastRunAt" class="text-sm text-gemini-subtext">Last scheduled attempt: {{ formatDate(schedule.lastRunAt) }}</p>
                <p v-if="schedule?.lastError" role="alert" class="text-sm text-gemini-text">Last scheduled scan failed: {{ schedule.lastError }}</p>
              </div>

              <!-- Add Directory Form -->
              <form @submit.prevent="addDirectory"
                class="bg-gemini-surface p-4 rounded-2xl border border-gemini-border space-y-4">
                <h3 class="text-sm font-semibold text-gemini-text flex items-center gap-2">
                  <FolderPlus class="h-4 w-4 text-gemini-blue" />
                  Add Media Directory
                </h3>

                <div class="grid grid-cols-1 sm:grid-cols-12 gap-3">
                  <input v-model="newPath" type="text" placeholder="/mnt/storage/media or /home/user/Pictures"
                    class="sm:col-span-7 bg-gemini-card border border-gemini-border rounded-xl px-3.5 py-2 text-sm text-gemini-text focus:outline-none focus:border-gemini-blue"
                    required />
                  <input v-model="newLabel" type="text" placeholder="Label (optional)"
                    class="sm:col-span-3 bg-gemini-card border border-gemini-border rounded-xl px-3.5 py-2 text-sm text-gemini-text focus:outline-none focus:border-gemini-blue" />
                  <button type="submit" :disabled="isLoading"
                    class="sm:col-span-2 bg-gemini-blue text-white rounded-xl px-4 py-2 text-sm font-medium hover:opacity-90 transition-opacity flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50">
                    Add Path
                  </button>
                </div>
                <FolderTagEditor v-model="newTags" />
              </form>

              <!-- Add inside Storage category panel in SettingsView.vue -->
              <div class="bg-gemini-surface p-5 rounded-2xl border border-gemini-border space-y-4 mt-6">
                <div class="flex items-center justify-between">
                  <div>
                    <h3 class="text-sm font-semibold text-gemini-text flex items-center gap-2">
                      <FileCode class="h-4 w-4 text-gemini-blue" />
                      Global Ignore List (.gitignore style)
                    </h3>
                    <p class="text-xs text-gemini-subtext mt-0.5">
                      Specify file names, extensions, or directory patterns to exclude from index scans.
                    </p>
                  </div>

                  <button @click="saveIgnorePatterns" :disabled="isSavingIgnore"
                    class="bg-gemini-blue text-white rounded-xl px-3.5 py-1.5 text-xs font-medium hover:opacity-90 transition-opacity flex items-center gap-1.5 cursor-pointer disabled:opacity-50">
                    <Save class="h-3.5 w-3.5" />
                    <span>{{ isSavingIgnore ? 'Saving...' : 'Save Rules' }}</span>
                  </button>
                </div>

                <textarea v-model="ignoreText" rows="6"
                  placeholder="node_modules/&#10;.git/&#10;*.tmp&#10;*.log&#10;.DS_Store"
                  class="w-full bg-gemini-card border border-gemini-border rounded-xl p-3 text-xs font-mono text-gemini-text focus:outline-none focus:border-gemini-blue transition-colors leading-relaxed"></textarea>
              </div>

              <!-- Indexed Directories List -->
              <div class="space-y-3">
                <h3 class="text-sm font-semibold text-gemini-text">Monitored Folders</h3>

                <div v-if="directories.length === 0"
                  class="text-sm text-gemini-subtext p-6 text-center border border-dashed border-gemini-border rounded-2xl">
                  No media directories added yet. Add a filesystem path above to get started.
                </div>

                <!-- Monitored Folders Row Item -->
                <div v-for="dir in directories" :key="dir.id"
                  class="p-4 bg-gemini-card border border-gemini-border rounded-2xl space-y-3">
                  <!-- Top Row: Icon, Path & Actions -->
                  <div class="flex items-center justify-between">
                    <div class="flex items-center gap-3.5 min-w-0">
                      <div class="h-10 w-10 rounded-xl bg-gemini-surface flex items-center justify-center shrink-0">
                        <Folder class="h-5 w-5 text-gemini-blue" />
                      </div>
                      <div class="min-w-0">
                        <div class="flex items-center gap-2">
                          <span class="block text-sm font-semibold text-gemini-text truncate">
                            {{ dir.label || dir.path }}
                          </span>
                          <span v-if="dir.totalFiles !== undefined"
                            class="inline-flex items-center gap-1.5 text-xs font-mono font-medium px-2.5 py-0.5 rounded-md bg-gemini-surface border border-gemini-border/60">
                            <span class="text-gemini-text font-semibold">Files:</span>
                            <span class="text-gemini-subtext font-bold">{{ dir.totalFiles.toLocaleString() }}</span>
                          </span>
                        </div>
                        <span class="block text-xs font-mono text-gemini-subtext truncate mt-0.5">
                          {{ dir.path }} &bull; Last scanned: {{ formatDate(dir.lastScannedAt) }}
                        </span>
                      </div>
                    </div>

                    <div class="flex items-center gap-2">
                      <button @click="triggerSingleScan(dir.id)" :disabled="isScanning[dir.id]"
                        class="p-2 text-gemini-subtext hover:text-gemini-blue hover:bg-gemini-surface rounded-lg transition-colors cursor-pointer disabled:opacity-50"
                        title="Rescan directory">
                        <RefreshCw class="h-4 w-4" :class="{ 'animate-spin': isScanning[dir.id] }" />
                      </button>

                      <button @click="removeDirectory(dir.id)"
                        class="p-2 text-gemini-subtext hover:text-red-500 hover:bg-gemini-surface rounded-lg transition-colors cursor-pointer"
                        title="Remove directory">
                        <Trash2 class="h-4 w-4" />
                      </button>
                    </div>
                  </div>

                  <div class="space-y-2 border-t border-gemini-border pt-3">
                    <p class="text-sm text-gemini-subtext">Folder tags: {{ dir.tags.map((tag) => tag.name).join(', ') || 'None' }}</p>
                    <template v-if="editingDirectory === dir.id">
                      <FolderTagEditor v-model="editedTags" />
                      <div class="flex gap-2">
                        <BaseButton variant="primary" @click="saveFolderTags(dir.id)">Save tags</BaseButton>
                        <BaseButton @click="editingDirectory = null">Cancel</BaseButton>
                      </div>
                    </template>
                    <BaseButton v-else @click="editTags(dir)">Edit folder tags</BaseButton>
                  </div>

                  <!-- Bottom Row: Category Badges Breakdown -->
                  <div v-if="dir.breakdown && Object.keys(dir.breakdown).length > 0"
                    class="flex items-center gap-2 pt-2 border-t border-gemini-border/50 flex-wrap">
                    <span v-for="(count, catKey) in dir.breakdown" :key="catKey"
                      class="text-xs px-2.5 py-1 rounded-lg bg-gemini-surface border border-gemini-border/60 text-gemini-subtext flex items-center gap-1.5">
                      <span class="font-medium text-gemini-text">{{ categoryLabels[catKey] || catKey }}:</span>
                      <span class="font-mono text-gemini-subtext font-semibold">{{ count.toLocaleString() }}</span>
                    </span>
                  </div>
                </div>
              </div>
            </div>
            <!-- end of storage section -->

            <div v-else-if="activeCategory === 'system'" class="space-y-4">
              <h2 class="text-xl font-semibold text-gemini-text">System & Hardware</h2>
              <p class="text-sm text-gemini-subtext">Monitor local Ollama LLM execution and GPU performance.</p>
            </div>

            <div v-else-if="activeCategory === 'account'" class="space-y-4">
              <h2 class="text-xl font-semibold text-gemini-text">Account & Security</h2>
              <p class="text-sm text-gemini-subtext">Manage session parameters and access permissions.</p>
            </div>

          </div>
        </section>

      </div>
    </main>
  </div>
</template>