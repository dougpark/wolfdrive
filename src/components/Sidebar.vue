<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { useTheme } from '@/composables/useTheme'
import {
    Folder,
    Image,
    Film,
    BookOpen,
    FileText,
    Music,
    Gamepad2,
    Cpu,
    Info,
    Settings,
    SlidersHorizontal,
    User,
    Shield
} from 'lucide-vue-next'

const route = useRoute()
const { isDark } = useTheme()

const logoSrc = computed(() =>
    isDark.value
        ? '/assets/wolfdrive_logo_dark.png'
        : '/assets/wolfdrive_logo_lite.png'
)

const isSettingsOpen = ref(false)
const dropdownRef = ref<HTMLDivElement | null>(null)

const toggleSettings = () => {
    isSettingsOpen.value = !isSettingsOpen.value
}

// Close dropdown when clicking outside
const handleClickOutside = (event: MouseEvent) => {
    if (dropdownRef.value && !dropdownRef.value.contains(event.target as Node)) {
        isSettingsOpen.value = false
    }
}

onMounted(() => {
    document.addEventListener('click', handleClickOutside)
})

onUnmounted(() => {
    document.removeEventListener('click', handleClickOutside)
})

const categories = [
    { name: 'Files', path: '/files', icon: Folder },
    { name: 'Photos', path: '/photos', icon: Image },
    { name: 'Videos', path: '/videos', icon: Film },
    { name: 'Books', path: '/books', icon: BookOpen },
    { name: 'Documents', path: '/documents', icon: FileText },
    { name: 'Music', path: '/music', icon: Music },
    { name: 'Movies', path: '/movies', icon: Film },
    { name: 'TV Shows', path: '/tv-shows', icon: Film },
    { name: 'Games', path: '/games', icon: Gamepad2 },
    { name: 'Software', path: '/software', icon: Cpu },
]
</script>

<template>
    <aside class="bg-gemini-card p-4 flex flex-col gap-6">
        <!-- Logo / Brand -->
        <div class="flex items-center justify-between gap-3 px-3 py-2">
            <div class="flex items-center gap-3">
                <img :src="logoSrc" alt="WolfDrive" class="h-8 w-8 object-contain" />
                <span class="font-semibold text-lg tracking-tight">WolfDrive</span>
            </div>

            <!-- Settings Dropdown Container -->
            <div class="relative" ref="dropdownRef">
                <button @click.stop="toggleSettings"
                    class="flex h-9 w-9 items-center justify-center rounded-full text-gemini-subtext hover:bg-gemini-surface transition-colors focus:outline-none focus:ring-2 focus:ring-gemini-blue cursor-pointer"
                    :class="{ 'bg-gemini-surface text-gemini-blue': isSettingsOpen }" aria-label="Settings menu"
                    :aria-expanded="isSettingsOpen">
                    <Settings class="h-5 w-5 transition-transform duration-200"
                        :class="{ 'rotate-45': isSettingsOpen }" />
                </button>

                <!-- Dropdown Menu -->
                <Transition enter-active-class="transition duration-150 ease-out"
                    enter-from-class="transform scale-95 opacity-0 -translate-y-1"
                    enter-to-class="transform scale-100 opacity-100 translate-y-0"
                    leave-active-class="transition duration-100 ease-in"
                    leave-from-class="transform scale-100 opacity-100 translate-y-0"
                    leave-to-class="transform scale-95 opacity-0 -translate-y-1">
                    <div v-if="isSettingsOpen"
                        class="absolute right-0 mt-2 w-56 rounded-xl border border-gemini-border bg-gemini-surface p-2 shadow-md z-50 transition-colors duration-200">
                        <div class="px-3 py-2 text-xs font-semibold uppercase tracking-wider text-gemini-subtext">
                            Preferences
                        </div>

                        <a href="/about" @click="isSettingsOpen = false"
                            class="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-gemini-text hover:bg-gemini-surface transition-colors">
                            <Info class="h-4 w-4 text-gemini-subtext" />
                            About WolfDrive
                        </a>
                        <a href="/settings" @click="isSettingsOpen = false"
                            class="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-gemini-text hover:bg-gemini-surface transition-colors">
                            <SlidersHorizontal class="h-4 w-4 text-gemini-subtext" />
                            App Settings
                        </a>

                        <a href="/settings/account" @click="isSettingsOpen = false"
                            class="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-gemini-text hover:bg-gemini-surface transition-colors">
                            <User class="h-4 w-4 text-gemini-subtext" />
                            Account
                        </a>

                        <hr class="my-1 border-gemini-border" />

                        <a href="/settings/admin" @click="isSettingsOpen = false"
                            class="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-gemini-text hover:bg-gemini-surface transition-colors">
                            <Shield class="h-4 w-4 text-gemini-subtext" />
                            Server Admin
                        </a>
                    </div>
                </Transition>
            </div>
        </div>

        <!-- Category Nav Links -->
        <nav class="flex flex-col gap-1">
            <RouterLink v-for="cat in categories" :key="cat.path" :to="cat.path"
                class="flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-colors" :class="[
                    route.path.startsWith(cat.path)
                        ? 'bg-gemini-blue/10 text-gemini-blue font-semibold'
                        : 'text-gemini-subtext hover:bg-gemini-surface hover:text-gemini-text'
                ]">
                <component :is="cat.icon" class="h-4 w-4 shrink-0" />
                <span>{{ cat.name }}</span>
            </RouterLink>
        </nav>
    </aside>
</template>