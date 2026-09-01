<script setup lang="ts">
import { computed } from 'vue'
import { useTheme } from '@/composables/useTheme'
import { HardDrive, ShieldCheck, Cpu, Sparkles } from 'lucide-vue-next'

const { isDark } = useTheme()

const logoSrc = computed(() =>
  isDark.value
    ? '/assets/wolfdrive_logo_dark.png'
    : '/assets/wolfdrive_logo_lite.png'
)
</script>

<template>
  <div class="min-h-screen bg-gemini-bg text-gemini-text flex flex-col transition-colors duration-200">
    <main class="flex-1 flex items-center justify-center p-6 sm:p-12">
      <div class="max-w-2xl w-full text-center">

        <!-- Large Hero Logo -->
        <div class="flex justify-center mb-8">
          <div class="relative group overflow-visible">

            <!-- Outer Glow Backdrop (Fixed transition blur clipping) -->
            <div
              class="absolute -inset-2 rounded-[40px] bg-linear-to-r from-gemini-blue via-gemini-purple to-gemini-sparkle opacity-25 blur-2xl transform-gpu will-change-transform group-hover:opacity-45 group-hover:scale-105 transition-all duration-500 ease-out">
            </div>

            <!-- Outer Card Shell -->
            <div
              class="relative bg-gemini-card border border-gemini-border rounded-[36px] p-10 sm:p-12 shadow-md flex items-center justify-center overflow-hidden transform-gpu will-change-transform group-hover:scale-[1.02] transition-transform duration-300 ease-out">
              <!-- Scaled Image Asset -->
              <img :src="logoSrc" alt="WolfDrive Brand Logo" class="h-48 sm:h-60 w-auto object-contain" />
            </div>
          </div>
        </div>

        <!-- Title & Hero Description -->
        <h1 class="text-4xl font-semibold tracking-tight text-gemini-text mb-3">
          WolfDrive
        </h1>
        <p class="text-xs font-mono tracking-widest uppercase text-gemini-sparkle font-semibold mb-6">
          Self-Hosted Media Manager
        </p>

        <p class="text-lg leading-relaxed text-gemini-subtext mb-10 max-w-xl mx-auto">
          An all-inclusive personal media hub running locally on your home server. Designed for high performance,
          private indexing, and seamless media playback across all your devices.
        </p>

        <!-- Feature Pills Grid -->
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-10">
          <div class="bg-gemini-card border border-gemini-border rounded-2xl p-4 text-center">
            <HardDrive class="h-5 w-5 text-gemini-blue mx-auto mb-2" />
            <span class="block text-xs font-medium text-gemini-text">Local Filesystem</span>
          </div>

          <div class="bg-gemini-card border border-gemini-border rounded-2xl p-4 text-center">
            <Cpu class="h-5 w-5 text-gemini-purple mx-auto mb-2" />
            <span class="block text-xs font-medium text-gemini-text">Bun & Hono</span>
          </div>

          <div class="bg-gemini-card border border-gemini-border rounded-2xl p-4 text-center">
            <Sparkles class="h-5 w-5 text-gemini-sparkle mx-auto mb-2" />
            <span class="block text-xs font-medium text-gemini-text">SQLite / Drizzle</span>
          </div>

          <div class="bg-gemini-card border border-gemini-border rounded-2xl p-4 text-center">
            <ShieldCheck class="h-5 w-5 text-gemini-blue mx-auto mb-2" />
            <span class="block text-xs font-medium text-gemini-text">100% Self-Hosted</span>
          </div>
        </div>

        <!-- Footer Note -->
        <div class="text-xs text-gemini-subtext">
          WolfDrive Server &bull; Running natively on Linux
        </div>

      </div>
    </main>
  </div>
</template>