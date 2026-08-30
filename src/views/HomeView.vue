<script setup lang="ts">
import { ref, onMounted } from 'vue'
import Navbar from '@/components/layout/Navbar.vue'
import { useTheme } from '@/composables/useTheme'

const { isDark, toggleTheme } = useTheme()

interface HelloResponse {
  message: string
  status: string
}

const message = ref('Loading...')

// Optional: Handle mobile sidebar toggle event from Navbar if needed
const handleToggleSidebar = () => {
  // Logic for opening mobile drawer/sidebar can be placed here
}

onMounted(async () => {
  try {
    const res = await fetch('/api/hello')
    const data = await res.json() as HelloResponse
    message.value = data.message
  } catch (err) {
    message.value = 'Failed to connect to WolfDrive server.'
  }
})
</script>

<template>
  <div class="min-h-screen bg-gemini-bg text-gemini-text flex flex-col transition-colors duration-200">
    <!-- Top Navigation Bar -->
    <Navbar @toggle-sidebar="handleToggleSidebar" />

    <!-- Main Content Area -->
    <main class="flex-1 flex flex-col items-center justify-center p-8">
      <!-- Main Status Card -->
      <div class="max-w-md w-full">
        <div class="bg-gemini-card border border-gemini-border rounded-[24px] shadow-sm p-8 text-center transition-colors duration-200">
          <h1 class="text-3xl font-semibold tracking-tight text-gemini-text mb-4 transition-colors duration-200">
            WolfDrive
          </h1>
          
          <p class="text-base leading-relaxed text-gemini-subtext mb-6 transition-colors duration-200">
            {{ message }}
          </p>
          
          <button class="bg-[#4285F4] text-white px-6 py-3 rounded-full hover:bg-blue-600 transition-all font-medium cursor-pointer shadow-xs">
            System Ready
          </button>
        </div>
      </div>
    </main>
  </div>
</template>