<script setup lang="ts">
import Sidebar from '@/components/Sidebar.vue'
import Navbar from '@/components/layout/Navbar.vue'
</script>

<template>
  <div class="flex h-screen w-screen overflow-hidden bg-gemini-bg text-gemini-text">
    <!-- Shared Left Sidebar -->
    <Sidebar class="w-64 shrink-0 border-r border-gemini-border" />

    <main class="flex min-w-0 flex-1 flex-col">
      <Navbar />

      <!-- Dynamic Main Content Area -->
      <div class="min-h-0 flex-1 overflow-y-auto">
        <slot />
      </div>
    </main>
  </div>
</template>