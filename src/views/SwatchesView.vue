<script setup lang="ts">
import { ref } from 'vue'

const isDark = ref(document.documentElement.classList.contains('dark'))

function toggleTheme() {
  isDark.value = !isDark.value
  document.documentElement.classList.toggle('dark', isDark.value)
}
</script>

<template>
  <main class="min-h-screen flex flex-col items-center justify-center p-8 bg-gemini-bg text-gemini-text transition-colors duration-200 relative">
    
    <div class="absolute top-6 right-6 flex items-center gap-3">
      <router-link 
        to="/" 
        class="px-4 py-2 rounded-full text-xs font-mono font-medium border border-gemini-border bg-gemini-card text-gemini-text hover:bg-gemini-surface transition-all shadow-xs"
      >
        ← Back to App
      </router-link>

      <button 
        @click="toggleTheme" 
        class="px-4 py-2 rounded-full text-xs font-mono font-medium border border-gemini-border bg-gemini-surface text-gemini-sparkle hover:opacity-90 transition-all cursor-pointer shadow-xs"
      >
        {{ isDark ? '🌙 Dark' : '☀️ Light' }}
      </button>
    </div>

    <div class="max-w-md w-full">
      <div class="bg-gemini-card border border-gemini-border rounded-[24px] shadow-sm p-6 space-y-4 transition-colors duration-200">
        <div class="flex items-center justify-between pb-3 border-b border-gemini-border">
          <h2 class="text-sm font-semibold tracking-wide text-gemini-text">
            Active Theme Palette
          </h2>
          <span class="text-xs font-mono px-2.5 py-0.5 rounded-full border bg-gemini-surface border-gemini-border text-gemini-sparkle">
            {{ isDark ? 'Dark Mode' : 'Light Mode' }}
          </span>
        </div>

        <div class="grid grid-cols-3 gap-2 text-center text-xs">
          <div class="p-2.5 rounded-xl border bg-gemini-bg border-gemini-border text-gemini-subtext">
            <span class="block font-medium">BG</span>
            <span class="font-mono text-[10px]">{{ isDark ? '#131314' : '#FFFFFF' }}</span>
          </div>
          <div class="p-2.5 rounded-xl border bg-gemini-surface border-gemini-border text-gemini-subtext">
            <span class="block font-medium">Surface</span>
            <span class="font-mono text-[10px]">{{ isDark ? '#1E1F20' : '#F0F4F9' }}</span>
          </div>
          <div class="p-2.5 rounded-xl border bg-gemini-card border-gemini-border text-gemini-subtext">
            <span class="block font-medium">Card</span>
            <span class="font-mono text-[10px]">{{ isDark ? '#282A2C' : '#FFFFFF' }}</span>
          </div>
        </div>

        <div class="flex justify-between items-center pt-2 gap-2 text-xs font-medium">
          <div class="flex-1 py-2 text-center rounded-lg bg-gemini-blue text-white">
            Blue
          </div>
          <div class="flex-1 py-2 text-center rounded-lg bg-gemini-purple text-white">
            Purple
          </div>
          <div class="flex-1 py-2 text-center rounded-lg border bg-gemini-surface border-gemini-border text-gemini-sparkle">
            Sparkle
          </div>
        </div>
      </div>
    </div>
  </main>
</template>