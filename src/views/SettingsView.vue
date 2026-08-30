<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useTheme } from '@/composables/useTheme'
import Navbar from '@/components/layout/Navbar.vue'
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

// Theme Selection Logic
type ThemeMode = 'light' | 'dark' | 'system'

onMounted(() => {
  initTheme()
  const saved = localStorage.getItem('wolfdrive-theme') as ThemeMode | null
  if (saved) {
    applyTheme(saved)
  } else {
    const isDark = document.documentElement.classList.contains('dark')
    selectedTheme.value = isDark ? 'dark' : 'light'
  }
})
</script>

<template>
  <div class="min-h-screen bg-gemini-bg text-gemini-text flex flex-col transition-colors duration-200">
    <!-- Top Navbar -->
    <Navbar />

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
            <button
              v-for="cat in categories"
              :key="cat.id"
              @click="activeCategory = cat.id"
              class="w-full flex items-center gap-3.5 px-4 py-3 rounded-xl text-sm font-medium transition-all text-left cursor-pointer"
              :class="[
                activeCategory === cat.id
                  ? 'bg-gemini-surface text-gemini-blue font-semibold shadow-xs'
                  : 'text-gemini-subtext hover:bg-gemini-surface/60 hover:text-gemini-text'
              ]"
            >
              <component 
                :is="cat.icon" 
                class="h-5 w-5 shrink-0"
                :class="activeCategory === cat.id ? 'text-gemini-blue' : 'text-gemini-subtext'"
              />
              <span class="truncate">{{ cat.label }}</span>
            </button>
          </nav>
        </aside>

        <!-- Right Column: Settings Panel -->
        <section class="lg:col-span-8 xl:col-span-9">
          <div class="bg-gemini-card border border-gemini-border rounded-3xl p-6 sm:p-8 shadow-sm transition-colors duration-200">
            
            <!-- Category: Theme & Appearance -->
            <div v-if="activeCategory === 'theme'" class="space-y-6">
              <div>
                <h2 class="text-xl font-semibold text-gemini-text">Theme & Appearance</h2>
                <p class="text-sm text-gemini-subtext mt-1">
                  Choose how WolfDrive appears on your screen. Select a light or dark theme, or sync with your system display preference.
                </p>
              </div>

              <hr class="border-gemini-border" />

              <!-- Theme Cards Selection Grid -->
              <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <!-- Light Theme Option -->
                <button
                  @click="applyTheme('light')"
                  class="group relative flex flex-col items-center justify-between p-5 rounded-2xl border text-center transition-all cursor-pointer"
                  :class="[
                    selectedTheme === 'light'
                      ? 'border-gemini-blue bg-gemini-surface ring-2 ring-gemini-blue/20'
                      : 'border-gemini-border bg-gemini-card hover:border-gemini-subtext/40 hover:bg-gemini-surface/40'
                  ]"
                >
                  <div class="flex items-center justify-center h-12 w-12 rounded-full bg-amber-100 text-amber-600 dark:bg-amber-950/60 dark:text-amber-400 mb-4 transition-transform group-hover:scale-105">
                    <Sun class="h-6 w-6" />
                  </div>
                  <div class="space-y-1">
                    <span class="block text-base font-medium text-gemini-text">Light Mode</span>
                    <span class="block text-xs text-gemini-subtext">Bright and high-contrast interface</span>
                  </div>
                  <div 
                    v-if="selectedTheme === 'light'"
                    class="absolute top-3 right-3 h-5 w-5 rounded-full bg-gemini-blue text-white flex items-center justify-center"
                  >
                    <Check class="h-3.5 w-3.5 stroke-3" />
                  </div>
                </button>

                <!-- Dark Theme Option -->
                <button
                  @click="applyTheme('dark')"
                  class="group relative flex flex-col items-center justify-between p-5 rounded-2xl border text-center transition-all cursor-pointer"
                  :class="[
                    selectedTheme === 'dark'
                      ? 'border-gemini-blue bg-gemini-surface ring-2 ring-gemini-blue/20'
                      : 'border-gemini-border bg-gemini-card hover:border-gemini-subtext/40 hover:bg-gemini-surface/40'
                  ]"
                >
                  <div class="flex items-center justify-center h-12 w-12 rounded-full bg-indigo-100 text-indigo-600 dark:bg-indigo-950/60 dark:text-indigo-400 mb-4 transition-transform group-hover:scale-105">
                    <Moon class="h-6 w-6" />
                  </div>
                  <div class="space-y-1">
                    <span class="block text-base font-medium text-gemini-text">Dark Mode</span>
                    <span class="block text-xs text-gemini-subtext">Reduced glare for low light</span>
                  </div>
                  <div 
                    v-if="selectedTheme === 'dark'"
                    class="absolute top-3 right-3 h-5 w-5 rounded-full bg-gemini-blue text-white flex items-center justify-center"
                  >
                    <Check class="h-3.5 w-3.5 stroke-3" />
                  </div>
                </button>

                <!-- System Theme Option -->
                <button
                  @click="applyTheme('system')"
                  class="group relative flex flex-col items-center justify-between p-5 rounded-2xl border text-center transition-all cursor-pointer"
                  :class="[
                    selectedTheme === 'system'
                      ? 'border-gemini-blue bg-gemini-surface ring-2 ring-gemini-blue/20'
                      : 'border-gemini-border bg-gemini-card hover:border-gemini-subtext/40 hover:bg-gemini-surface/40'
                  ]"
                >
                  <div class="flex items-center justify-center h-12 w-12 rounded-full bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-200 mb-4 transition-transform group-hover:scale-105">
                    <Monitor class="h-6 w-6" />
                  </div>
                  <div class="space-y-1">
                    <span class="block text-base font-medium text-gemini-text">System Default</span>
                    <span class="block text-xs text-gemini-subtext">Sync with OS theme settings</span>
                  </div>
                  <div 
                    v-if="selectedTheme === 'system'"
                    class="absolute top-3 right-3 h-5 w-5 rounded-full bg-gemini-blue text-white flex items-center justify-center"
                  >
                    <Check class="h-3.5 w-3.5 stroke-3" />
                  </div>
                </button>
              </div>
            </div>

            <!-- Placeholder Panels for Future Settings -->
            <div v-else-if="activeCategory === 'storage'" class="space-y-4">
              <h2 class="text-xl font-semibold text-gemini-text">Storage & Indexing</h2>
              <p class="text-sm text-gemini-subtext">Configure media directory paths and rescan intervals.</p>
            </div>

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