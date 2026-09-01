<script setup lang="ts">
import Sidebar from '@/components/Sidebar.vue'
</script>

<template>
  <div class="flex h-screen w-screen overflow-hidden bg-gemini-bg text-gemini-text">
    <!-- Shared Left Sidebar -->
    <Sidebar class="w-64 shrink-0 border-r border-gemini-border" />

    <!-- Dynamic Main Content Area -->
    <main class="min-h-0 min-w-0 flex-1 overflow-y-auto">
      <slot />
    </main>
  </div>
</template>