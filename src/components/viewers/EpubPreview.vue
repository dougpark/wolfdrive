<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import ePub from 'epubjs'
import { Minus, Plus, SkipBack, History } from 'lucide-vue-next'

const props = defineProps<{
    url: string
    fileId: string
    isDark: boolean
}>()

const viewerContainer = ref<HTMLElement | null>(null)
const loadError = ref('')
const fontSize = ref(15)
const savedCfi = ref<string | null>(null)
const currentCfi = ref<string | null>(null)

const MIN_FONT_SIZE = 12
const MAX_FONT_SIZE = 24

let book: any = null
let rendition: any = null
let saveTimer: ReturnType<typeof setTimeout> | null = null

const fontStack = `Inter, Roboto, -apple-system, 'Segoe UI', Helvetica, Arial, sans-serif`
/** Comfortable reading measure (~65–75 characters per line at 15px). */
const readingWidth = '720px'

/** Offer the jump-back button only when the reader has moved away from the saved spot. */
const canJumpToSaved = computed(() => !!savedCfi.value && savedCfi.value !== currentCfi.value)

function applyTheme() {
    const textColor = props.isDark ? '#e3e3e3' : '#1f1f1f'
    const bgColor = props.isDark ? '#282a2c' : '#ffffff'

    rendition?.themes.default({
        body: {
            color: `${textColor} !important`,
            background: `${bgColor} !important`,
            'font-family': `${fontStack} !important`,
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
    applyFontSize()
}

/** Font size lives outside the theme object so the controls can resize without re-registering rules. */
function applyFontSize() {
    rendition?.themes.fontSize(`${fontSize.value}px`)
}

async function fetchReaderState() {
    try {
        const res = await fetch(`/api/reading-state/${props.fileId}`)
        if (!res.ok) return
        const state = await res.json()
        if (typeof state.fontSize === 'number' && state.fontSize >= MIN_FONT_SIZE && state.fontSize <= MAX_FONT_SIZE) {
            fontSize.value = state.fontSize
        }
        if (typeof state.cfi === 'string' && state.cfi) savedCfi.value = state.cfi
    } catch (error) {
        console.error('Failed to load reading state:', error)
    }
}

/** Debounced upsert: scrolling fires `relocated` continuously, so coalesce into one write. */
function persistReaderState() {
    if (saveTimer) clearTimeout(saveTimer)
    saveTimer = setTimeout(async () => {
        try {
            await fetch(`/api/reading-state/${props.fileId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ cfi: currentCfi.value ?? savedCfi.value, fontSize: fontSize.value }),
            })
            savedCfi.value = currentCfi.value ?? savedCfi.value
        } catch (error) {
            console.error('Failed to save reading state:', error)
        }
    }, 600)
}

function handleRelocated(location: any) {
    const cfi = location?.start?.cfi
    if (!cfi) return
    currentCfi.value = cfi
    persistReaderState()
}

function changeFontSize(delta: number) {
    const next = Math.min(MAX_FONT_SIZE, Math.max(MIN_FONT_SIZE, fontSize.value + delta))
    if (next === fontSize.value) return
    fontSize.value = next
    applyFontSize()
    persistReaderState()
}

function jumpToBeginning() {
    rendition?.display()
}

function jumpToSavedPosition() {
    if (savedCfi.value) rendition?.display(savedCfi.value)
}

async function loadBook() {
    if (!viewerContainer.value) return

    book?.destroy()
    loadError.value = ''
    savedCfi.value = null
    currentCfi.value = null

    try {
        await fetchReaderState()

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
        rendition.on('relocated', handleRelocated)
        // Resume at the saved CFI when one exists, otherwise open the first section.
        await rendition.display(savedCfi.value || undefined)
    } catch (error) {
        console.error('Failed to load EPUB preview:', error)
        loadError.value = 'Unable to load this EPUB preview.'
    }
}

watch(() => props.isDark, applyTheme)
watch(() => props.url, loadBook)

onMounted(loadBook)

onBeforeUnmount(() => {
    if (saveTimer) clearTimeout(saveTimer)
    book?.destroy()
})
</script>

<template>
    <div class="flex h-full flex-col overflow-hidden rounded-xl border border-gemini-border bg-gemini-card">
        <div class="flex items-center justify-between gap-2 border-b border-gemini-border px-3 py-2">
            <div class="flex items-center gap-1">
                <button type="button" :disabled="fontSize <= MIN_FONT_SIZE"
                    class="rounded-lg p-2 text-gemini-text transition-colors hover:bg-gemini-surface cursor-pointer disabled:cursor-not-allowed disabled:opacity-40"
                    title="Decrease font size" @click="changeFontSize(-1)">
                    <Minus class="h-4 w-4" />
                </button>
                <span class="w-10 text-center font-mono text-xs text-gemini-subtext">{{ fontSize }}px</span>
                <button type="button" :disabled="fontSize >= MAX_FONT_SIZE"
                    class="rounded-lg p-2 text-gemini-text transition-colors hover:bg-gemini-surface cursor-pointer disabled:cursor-not-allowed disabled:opacity-40"
                    title="Increase font size" @click="changeFontSize(1)">
                    <Plus class="h-4 w-4" />
                </button>
                <div class="mx-1 h-4 w-px bg-gemini-border"></div>
                <button type="button"
                    class="rounded-lg p-2 text-gemini-text transition-colors hover:bg-gemini-surface cursor-pointer"
                    title="Jump to beginning" @click="jumpToBeginning">
                    <SkipBack class="h-4 w-4" />
                </button>
                <button type="button" :disabled="!canJumpToSaved"
                    class="rounded-lg p-2 text-gemini-text transition-colors hover:bg-gemini-surface cursor-pointer disabled:cursor-not-allowed disabled:opacity-40"
                    title="Return to last read position" @click="jumpToSavedPosition">
                    <History class="h-4 w-4" />
                </button>
            </div>
            <span class="text-xs text-gemini-subtext">EPUB Preview</span>
        </div>
        <div ref="viewerContainer" class="min-h-0 flex-1 overflow-hidden"></div>
        <p v-if="loadError" class="px-4 py-3 text-sm text-gemini-subtext">{{ loadError }}</p>
    </div>
</template>