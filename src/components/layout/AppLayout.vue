<script setup lang="ts">
import { onBeforeUnmount, onMounted } from 'vue'
import Sidebar from '@/components/Sidebar.vue'
import AiChatPanel from '@/components/common/AiChatPanel.vue'
import { useAiChatPanel } from '@/composables/useAiChatPanel'

const { close, isOpen, toggle } = useAiChatPanel()

function handleKeydown(event: KeyboardEvent) {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
    event.preventDefault()
    toggle()
    return
  }

  if (event.key === 'Escape' && isOpen.value) {
    close()
  }
}

onMounted(() => {
  window.addEventListener('keydown', handleKeydown)
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleKeydown)
})
</script>

<template>
  <div class="flex h-screen w-screen overflow-hidden bg-gemini-bg text-gemini-text">
    <!-- Shared Left Sidebar -->
    <Sidebar class="w-64 shrink-0 border-r border-gemini-border" />

    <!-- Dynamic Main Content Area -->
    <main class="min-h-0 min-w-0 flex-1 overflow-y-auto">
      <slot />
    </main>

    <AiChatPanel />
  </div>
</template>