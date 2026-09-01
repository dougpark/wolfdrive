<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useTheme } from '@/composables/useTheme'
import { useFilePreview } from '@/composables/useFilePreview'
import FilePreviewOverlay from '@/components/viewers/FilePreviewOverlay.vue'
import type { MediaFile } from '@/types/media'

const route = useRoute()
const router = useRouter()
const { isDark } = useTheme()
const isLoading = ref(true)
const errorMessage = ref('')
const originalTitle = document.title
const {
    previewFile,
    hasPrevious,
    hasNext,
    textContent,
    isTextPreviewLoading,
    isTextPreview,
    isMarkdownPreview,
    open: openPreview,
    close: closePreview,
} = useFilePreview()

async function loadPreview() {
    isLoading.value = true
    errorMessage.value = ''

    try {
        const id = String(route.params.id || '')
        const response = await fetch(`/api/files/${encodeURIComponent(id)}`)
        if (!response.ok) throw new Error(`Preview metadata request failed: ${response.status}`)

        const file = await response.json() as MediaFile
        document.title = file.filename
        openPreview(file, [file])
    } catch (error) {
        console.error('Failed to load preview:', error)
        document.title = 'Preview unavailable'
        errorMessage.value = 'Unable to load this file preview.'
    } finally {
        isLoading.value = false
    }
}

function closePreviewTab() {
    closePreview()
    window.close()
    router.push('/files')
}

onMounted(loadPreview)

onBeforeUnmount(() => {
    document.title = originalTitle
})
</script>

<template>
    <main class="min-h-screen bg-gemini-bg p-8 text-gemini-text">
        <div v-if="isLoading" class="rounded-3xl border border-gemini-border bg-gemini-card p-8 shadow-sm">
            Loading preview...
        </div>
        <div v-else-if="errorMessage" class="rounded-3xl border border-gemini-border bg-gemini-card p-8 shadow-sm">
            {{ errorMessage }}
        </div>

        <FilePreviewOverlay v-if="previewFile" :file="previewFile" :is-dark="isDark" :is-markdown="isMarkdownPreview"
            :is-text="isTextPreview" :is-text-loading="isTextPreviewLoading" :text-content="textContent"
            :has-previous="hasPrevious" :has-next="hasNext" @close="closePreviewTab" />
    </main>
</template>