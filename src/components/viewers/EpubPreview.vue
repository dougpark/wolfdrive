<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import ePub from 'epubjs'
import { ChevronLeft, ChevronRight } from 'lucide-vue-next'

const props = defineProps<{
    url: string
    isDark: boolean
}>()

const viewerContainer = ref<HTMLElement | null>(null)
const loadError = ref('')
let book: any = null
let rendition: any = null

function applyTheme() {
    rendition?.themes.default({
        body: {
            color: props.isDark ? '#e3e3e3 !important' : '#1f1f1f !important',
            background: `${props.isDark ? '#282a2c' : '#ffffff'} !important`,
            fontFamily: 'sans-serif',
            padding: '20px !important',
        },
    })
}

async function loadBook() {
    if (!viewerContainer.value) return

    book?.destroy()
    loadError.value = ''

    try {
        const response = await fetch(props.url)
        if (!response.ok) throw new Error(`EPUB request failed: ${response.status}`)

        book = ePub(await response.arrayBuffer())
        await book.ready

        rendition = book.renderTo(viewerContainer.value, {
            width: viewerContainer.value.clientWidth,
            height: viewerContainer.value.clientHeight,
            spread: 'none',
        })
        applyTheme()
        await rendition.display()
    } catch (error) {
        console.error('Failed to load EPUB preview:', error)
        loadError.value = 'Unable to load this EPUB preview.'
    }
}

function previousPage() {
    rendition?.prev()
}

function nextPage() {
    rendition?.next()
}

watch(() => props.isDark, applyTheme)
watch(() => props.url, loadBook)

onMounted(loadBook)

onBeforeUnmount(() => {
    book?.destroy()
})
</script>

<template>
    <div class="flex h-full flex-col overflow-hidden rounded-xl border border-gemini-border bg-gemini-card">
        <div ref="viewerContainer" class="min-h-0 flex-1 overflow-hidden"></div>
        <p v-if="loadError" class="px-4 py-3 text-sm text-gemini-subtext">{{ loadError }}</p>
        <div class="flex items-center justify-between border-t border-gemini-border px-3 py-2">
            <button type="button"
                class="rounded-lg p-2 text-gemini-text hover:bg-gemini-surface transition-colors cursor-pointer"
                title="Previous page" @click="previousPage">
                <ChevronLeft class="h-4 w-4" />
            </button>
            <span class="text-xs text-gemini-subtext">EPUB Preview</span>
            <button type="button"
                class="rounded-lg p-2 text-gemini-text hover:bg-gemini-surface transition-colors cursor-pointer"
                title="Next page" @click="nextPage">
                <ChevronRight class="h-4 w-4" />
            </button>
        </div>
    </div>
</template>