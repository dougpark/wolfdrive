<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import ePub from 'epubjs'

const props = defineProps<{
    url: string
    isDark: boolean
}>()

const viewerContainer = ref<HTMLElement | null>(null)
const loadError = ref('')
let book: any = null
let rendition: any = null

const fontStack = `Inter, Roboto, -apple-system, 'Segoe UI', Helvetica, Arial, sans-serif`
/** Comfortable reading measure (~65–75 characters per line at 15px). */
const readingWidth = '720px'

function applyTheme() {
    const textColor = props.isDark ? '#e3e3e3' : '#1f1f1f'
    const bgColor = props.isDark ? '#282a2c' : '#ffffff'

    rendition?.themes.default({
        body: {
            color: `${textColor} !important`,
            background: `${bgColor} !important`,
            'font-family': `${fontStack} !important`,
            'font-size': '15px !important',
            'line-height': '1.6 !important',
            // Center a fixed-width reading column inside the full-width iframe.
            'max-width': `${readingWidth} !important`,
            margin: '0 auto !important',
            padding: '24px !important',
        },
        'p, div, span, li, td, th, blockquote, em, strong, a': {
            color: `${textColor} !important`,
            'font-family': `${fontStack} !important`,
        },
        'h1, h2, h3, h4, h5, h6': {
            color: `${textColor} !important`,
            'font-family': `${fontStack} !important`,
            'font-weight': '600 !important',
        },
        img: {
            'max-width': '100% !important',
            height: 'auto !important',
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

        // Continuous manager stitches spine sections together so the whole
        // book scrolls vertically instead of stopping at each chapter break.
        rendition = book.renderTo(viewerContainer.value, {
            width: viewerContainer.value.clientWidth,
            height: viewerContainer.value.clientHeight,
            flow: 'scrolled-doc',
            manager: 'continuous',
        })
        applyTheme()
        await rendition.display()
    } catch (error) {
        console.error('Failed to load EPUB preview:', error)
        loadError.value = 'Unable to load this EPUB preview.'
    }
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
        <div class="flex items-center justify-center border-t border-gemini-border px-3 py-2">
            <span class="text-xs text-gemini-subtext">EPUB Preview</span>
        </div>
    </div>
</template>