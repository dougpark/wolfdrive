<script setup lang="ts">
import { ref, onMounted } from 'vue'

interface HelloResponse {
  message: string
  status: string
}

const message = ref('Loading...')

// Track dark mode state (defaults to false / light mode)
const isDark = ref(document.documentElement.classList.contains('dark'))

function toggleTheme() {
  isDark.value = !isDark.value
  document.documentElement.classList.toggle('dark', isDark.value)
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
  <main class="min-h-screen flex flex-col items-center justify-center p-8 bg-gemini-bg text-gemini-text transition-colors duration-200 relative">
    
    <!-- Top Right Controls -->
    <div class="absolute top-6 right-6 flex items-center gap-3">
      <router-link 
        to="/swatches" 
        class="px-4 py-2 rounded-full text-xs font-mono font-medium border border-gemini-border bg-gemini-card text-gemini-text hover:bg-gemini-surface transition-all shadow-xs"
      >
        View Swatches →
      </router-link>

      <button 
        @click="toggleTheme" 
        class="px-4 py-2 rounded-full text-xs font-mono font-medium border border-gemini-border bg-gemini-surface text-gemini-sparkle hover:opacity-90 transition-all cursor-pointer shadow-xs"
      >
        {{ isDark ? '🌙 Dark' : '☀️ Light' }}
      </button>
    </div>

    <!-- Main Status Card -->
    <div class="max-w-md w-full">
      <div class="bg-gemini-card border border-gemini-border rounded-[24px] shadow-sm p-8 text-center transition-colors duration-200">
        <h1 class="text-3xl font-semibold tracking-tight text-gemini-text mb-4 transition-colors duration-200">
          WolfDrive
        </h1>
        
        <p class="text-base leading-relaxed text-gemini-subtext mb-6 transition-colors duration-200">
          {{ message }}
        </p>
        
        <button class="bg-gemini-blue text-white px-6 py-3 rounded-full hover:opacity-90 transition-all font-medium cursor-pointer shadow-xs">
          System Ready
        </button>
      </div>
    </div>
  </main>
</template>