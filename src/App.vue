<script setup lang="ts">
import { ref, onMounted } from 'vue'

// Define the shape of your API response
interface HelloResponse {
  message: string
  status: string
}

const message = ref('Loading...')

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
  <main class="min-h-screen flex items-center justify-center p-8 bg-[#FFFFFF]">
    <div class="bg-white border border-[#E3E3E3] rounded-[24px] shadow-sm p-8 max-w-md w-full text-center">
      <h1 class="text-3xl font-semibold tracking-tight text-[#1F1F1F] mb-4">
        WolfDrive
      </h1>
      <p class="text-[#474747] text-base leading-relaxed mb-6">
        {{ message }}
      </p>
      <button class="bg-[#4285F4] text-white px-6 py-3 rounded-full hover:bg-blue-600 transition-all font-medium">
        System Ready
      </button>
    </div>
  </main>
</template>