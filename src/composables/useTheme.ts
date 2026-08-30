import { ref } from 'vue'

export type ThemeMode = 'light' | 'dark' | 'system'

const selectedTheme = ref<ThemeMode>('system')
const isDark = ref<boolean>(false)

export function useTheme() {
    function applyTheme(mode: ThemeMode) {
        selectedTheme.value = mode
        localStorage.setItem('wolfdrive-theme', mode)

        let enableDark = false
        if (mode === 'dark') {
            enableDark = true
        } else if (mode === 'light') {
            enableDark = false
        } else {
            enableDark = window.matchMedia('(prefers-color-scheme: dark)').matches
        }

        isDark.value = enableDark
        document.documentElement.classList.toggle('dark', enableDark)

        // Lock inline root background to guarantee paint color during route mounts
        document.documentElement.style.backgroundColor = enableDark ? '#131314' : '#ffffff'
    }

    function initTheme() {
        const saved = localStorage.getItem('wolfdrive-theme') as ThemeMode | null
        if (saved) {
            applyTheme(saved)
        } else {
            applyTheme('system')
        }
    }

    function toggleTheme() {
        applyTheme(isDark.value ? 'light' : 'dark')
    }

    return {
        selectedTheme,
        isDark,
        applyTheme,
        initTheme,
        toggleTheme
    }
}