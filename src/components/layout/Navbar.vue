<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import { Info, Settings, Menu, SlidersHorizontal, User, Shield } from 'lucide-vue-next';
import { computed } from 'vue'
import { useTheme } from '@/composables/useTheme'

const { isDark } = useTheme()

const logoSrc = computed(() => 
  isDark.value 
    ? '/assets/wolfdrive_logo_dark.png' 
    : '/assets/wolfdrive_logo_lite.png'
)


// Define explicit component events
const emit = defineEmits<{
  (e: 'toggle-sidebar'): void;
}>();

const isSettingsOpen = ref(false);
const dropdownRef = ref<HTMLDivElement | null>(null);

const toggleSettings = () => {
  isSettingsOpen.value = !isSettingsOpen.value;
};

// Close dropdown when clicking outside
const handleClickOutside = (event: MouseEvent) => {
  if (dropdownRef.value && !dropdownRef.value.contains(event.target as Node)) {
    isSettingsOpen.value = false;
  }
};

onMounted(() => {
  document.addEventListener('click', handleClickOutside);
});

onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside);
});
</script>

<template>
  <header class="sticky top-0 z-40 w-full border-b border-gemini-border bg-gemini-bg/80 backdrop-blur-md transition-colors duration-200">
    <div class="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
      
      <!-- Left: Logo & Mobile Toggle -->
      <div class="flex items-center gap-3">
        <!-- Mobile Sidebar Toggle -->
        <button 
          @click="emit('toggle-sidebar')"
          class="rounded-xl p-2 text-gemini-subtext hover:bg-gemini-surface transition-colors lg:hidden cursor-pointer"
          aria-label="Toggle navigation menu"
        >
          <Menu class="h-6 w-6" />
        </button>

        <!-- Brand Link -->
        <a href="/" class="flex items-center gap-3 transition-opacity hover:opacity-90">
        <!-- logo swapped based on isDark -->
          <img 
            :src="logoSrc" 
            alt="WolfDrive Logo" 
            class="h-9 w-auto object-contain"
          />
          <span class="text-xl font-semibold tracking-tight text-gemini-text hidden sm:inline-block">
            WolfDrive
          </span>
        </a>
      </div>

      <!-- Right: Settings & Actions -->
      <div class="flex items-center gap-2">
        <!-- Settings Dropdown Container -->
        <div class="relative" ref="dropdownRef">
          <button
            @click.stop="toggleSettings"
            class="flex h-10 w-10 items-center justify-center rounded-full text-gemini-subtext hover:bg-gemini-surface transition-colors focus:outline-none focus:ring-2 focus:ring-gemini-blue cursor-pointer"
            :class="{ 'bg-gemini-surface text-gemini-blue': isSettingsOpen }"
            aria-label="Settings menu"
            :aria-expanded="isSettingsOpen"
          >
            <Settings class="h-5 w-5 transition-transform duration-200" :class="{ 'rotate-45': isSettingsOpen }" />
          </button>

          <!-- Dropdown Menu -->
          <Transition
            enter-active-class="transition duration-150 ease-out"
            enter-from-class="transform scale-95 opacity-0 -translate-y-1"
            enter-to-class="transform scale-100 opacity-100 translate-y-0"
            leave-active-class="transition duration-100 ease-in"
            leave-from-class="transform scale-100 opacity-100 translate-y-0"
            leave-to-class="transform scale-95 opacity-0 -translate-y-1"
          >
            <div
              v-if="isSettingsOpen"
              class="absolute right-0 mt-2 w-56 rounded-xl border border-gemini-border bg-gemini-card p-2 shadow-sm z-50 transition-colors duration-200"
            >
              <div class="px-3 py-2 text-xs font-semibold uppercase tracking-wider text-gemini-subtext">
                Preferences
              </div>

              <!-- Inside Navbar dropdown menu -->
              <a
                href="/about"
                @click="isSettingsOpen = false"
                class="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-gemini-text hover:bg-gemini-surface transition-colors"
              >
                <Info class="h-4 w-4 text-gemini-subtext" />
                About WolfDrive
              </a>
              <a
                href="/settings"
                @click="isSettingsOpen = false"
                class="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-gemini-text hover:bg-gemini-surface transition-colors"
              >
                <SlidersHorizontal class="h-4 w-4 text-gemini-subtext" />
                App Settings
              </a>

              <a
                href="/settings/account"
                @click="isSettingsOpen = false"
                class="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-gemini-text hover:bg-gemini-surface transition-colors"
              >
                <User class="h-4 w-4 text-gemini-subtext" />
                Account
              </a>

              <hr class="my-1 border-gemini-border" />

              <a
                href="/settings/admin"
                @click="isSettingsOpen = false"
                class="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-gemini-text hover:bg-gemini-surface transition-colors"
              >
                <Shield class="h-4 w-4 text-gemini-subtext" />
                Server Admin
              </a>
            </div>
          </Transition>
        </div>
      </div>
      
    </div>
  </header>
</template>