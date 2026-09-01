<script setup lang="ts">
import Sidebar from '@/components/Sidebar.vue'
</script>

<template>
  <div class="flex h-screen w-screen overflow-hidden bg-gemini-bg text-gemini-text">
    <!-- Shared Left Sidebar -->
    <Sidebar class="w-64 shrink-0 border-r border-gemini-border" />

    <!-- Dynamic Main Content Area -->
    <main class="flex-1 flex flex-col min-w-0 overflow-y-auto">
      <slot /> <!-- Or <RouterView /> if using Vue Router -->
    </main>
  </div>
</template>