import { computed, onBeforeUnmount, ref, watch } from 'vue'
import type { MediaFile } from '@/types/media'

const TEXT_EXTENSIONS = ['md', 'markdown', 'txt', 'json', 'csv', 'log', 'xml', 'yaml', 'yml']

function isTextFile(file: MediaFile) {
    return file.mimeType?.startsWith('text/') || TEXT_EXTENSIONS.includes(file.extension.toLowerCase())
}

// Shared full-page preview state: tracks the active file within a list so
// callers can drive prev/next navigation across a page's current results.
export function useFilePreview() {
    const fileList = ref<MediaFile[]>([])
    const previewIndex = ref(-1)
    const textContent = ref('')
    const isTextPreviewLoading = ref(false)

    const previewFile = computed(() => previewIndex.value >= 0 ? fileList.value[previewIndex.value] ?? null : null)
    const hasPrevious = computed(() => previewIndex.value > 0)
    const hasNext = computed(() => previewIndex.value >= 0 && previewIndex.value < fileList.value.length - 1)

    const isTextPreview = computed(() => previewFile.value ? isTextFile(previewFile.value) : false)
    const isMarkdownPreview = computed(() => {
        const extension = previewFile.value?.extension.toLowerCase()
        return extension === 'md' || extension === 'markdown'
    })

    async function loadTextContent(file: MediaFile) {
        textContent.value = ''
        if (!isTextFile(file)) return

        isTextPreviewLoading.value = true
        try {
            const response = await fetch(`/api/stream/${file.id}`)
            if (!response.ok) throw new Error(`Preview request failed: ${response.status}`)
            textContent.value = await response.text()
        } catch (error) {
            console.error('Failed to load text preview:', error)
            textContent.value = 'Unable to load this file preview.'
        } finally {
            isTextPreviewLoading.value = false
        }
    }

    function open(file: MediaFile, list: MediaFile[] = [file]) {
        fileList.value = list
        const index = list.findIndex((item) => item.id === file.id)
        previewIndex.value = index === -1 ? 0 : index
    }

    function close() {
        previewIndex.value = -1
        fileList.value = []
        textContent.value = ''
    }

    function goNext() {
        if (hasNext.value) previewIndex.value += 1
    }

    function goPrevious() {
        if (hasPrevious.value) previewIndex.value -= 1
    }

    watch(previewFile, (file) => {
        document.body.style.overflow = file ? 'hidden' : ''
        if (file) loadTextContent(file)
    })

    onBeforeUnmount(() => {
        document.body.style.overflow = ''
    })

    return {
        previewFile,
        hasPrevious,
        hasNext,
        textContent,
        isTextPreviewLoading,
        isTextPreview,
        isMarkdownPreview,
        open,
        close,
        goNext,
        goPrevious,
    }
}
