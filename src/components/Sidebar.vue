<script setup lang="ts">
import { computed } from 'vue'
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
    Cpu
} from 'lucide-vue-next'

const route = useRoute()
const { isDark } = useTheme()

const logoSrc = computed(() =>
    isDark.value
        ? '/assets/wolfdrive_logo_dark.png'
        : '/assets/wolfdrive_logo_lite.png'
)

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
        <div class="flex items-center gap-3 px-3 py-2">
            <img :src="logoSrc" alt="WolfDrive" class="h-8 w-8 object-contain" />
            <span class="font-semibold text-lg tracking-tight">WolfDrive</span>
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