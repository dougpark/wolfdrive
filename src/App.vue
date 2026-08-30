<script setup lang="ts">
import { onMounted } from 'vue'
import { useTheme } from './composables/useTheme'

const { initTheme } = useTheme()

onMounted(() => {
  initTheme()
})
</script>
<template>
  <div class="min-h-screen bg-gemini-bg text-gemini-text transition-colors duration-200">
    <router-view />
  </div>
</template>