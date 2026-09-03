<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import ePub, { EpubCFI } from 'epubjs'
import { Minus, Plus, SkipBack, ArrowRight } from 'lucide-vue-next'

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
const farthestCfi = ref<string | null>(null)
/** How far the reader has scrolled inside the current section, for fine-grained distance tracking. */
const currentScrollOffset = ref(0)
const farthestScrollOffset = ref(0)
/** Book length in characters once locations are known; null until generated or loaded from the DB. */
const totalChars = ref<number | null>(null)
/** Percent of the book read at the current position. */
const percentRead = ref<number | null>(null)

const MIN_FONT_SIZE = 12
const MAX_FONT_SIZE = 24

let book: any = null
let rendition: any = null
let saveTimer: ReturnType<typeof setTimeout> | null = null

const fontStack = `Inter, Roboto, -apple-system, 'Segoe UI', Helvetica, Arial, sans-serif`
/** Comfortable reading measure (~65–75 characters per line at 15px). */
const readingWidth = '720px'

/** The reader is behind its high-water mark when its character position trails the farthest CFI. */
const isBehindFarthest = computed(() => {
    if (!farthestCfi.value || !currentCfi.value) return false
    const cmp = compareCfi(currentCfi.value, farthestCfi.value)
    if (cmp < 0) return true
    // Same section: also flag meaningful backscrolls (~a page) so the banner reacts promptly.
    if (cmp === 0 && currentScrollOffset.value < farthestScrollOffset.value - 400) return true
    return false
})

/** True character-position comparison via epub.js (TOC CFIs compare correctly, unlike spine indexes). */
function compareCfi(a: string, b: string): number {
    try {
        return new EpubCFI().compare(a, b)
    } catch {
        return 0
    }
}

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
        if (typeof state.farthestCfi === 'string' && state.farthestCfi) farthestCfi.value = state.farthestCfi
        if (typeof state.totalChars === 'number' && state.totalChars > 0) totalChars.value = state.totalChars
    } catch (error) {
        console.error('Failed to load reading state:', error)
    }
}

/**
 * Generate epub.js locations in the background to learn the book's character length, then
 * persist it so future loads (and the BooksView tooltip) can skip generation. Percent does
 * not depend on this — it is computed from the CFI directly — so failure here is harmless.
 */
async function ensureLocations() {
    if (!book || totalChars.value) return
    try {
        await book.locations.generate(750)
        totalChars.value = book.locations.length() * 750
        persistReaderState()
    } catch (error) {
        console.error('Failed to generate EPUB locations:', error)
    }
}

/**
 * Percent read = position of the CFI's spine section within the book's reading order.
 * Pure CFI math: no locations generation required, works instantly for every book.
 */
function updatePercent(cfi: string | null) {
    if (!cfi || !book) {
        percentRead.value = null
        return
    }
    const match = /\/(\d+)(?:\[|!|$)/.exec(cfi)
    const total = book.spine?.spineItems?.length ?? 0
    if (!match || total === 0) {
        percentRead.value = null
        return
    }
    const index = Math.max(0, parseInt(match[1], 10) / 2 - 1)
    percentRead.value = Math.min(100, Math.round((index / total) * 100))
}

/** Debounced upsert: scrolling fires `relocated` continuously, so coalesce into one write. */
function persistReaderState() {
    if (saveTimer) clearTimeout(saveTimer)
    saveTimer = setTimeout(async () => {
        try {
            await fetch(`/api/reading-state/${props.fileId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    cfi: currentCfi.value ?? savedCfi.value,
                    farthestCfi: farthestCfi.value,
                    fontSize: fontSize.value,
                    totalChars: totalChars.value ?? undefined,
                    percentRead: percentRead.value ?? undefined,
                }),
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
    currentScrollOffset.value = getScrollOffset()
    // Advance the high-water mark only at genuinely new character positions.
    if (!farthestCfi.value || compareCfi(cfi, farthestCfi.value) > 0) {
        farthestCfi.value = cfi
        farthestScrollOffset.value = currentScrollOffset.value
    } else if (compareCfi(cfi, farthestCfi.value) === 0) {
        // Same section as the mark: track the deepest scroll point within it.
        farthestScrollOffset.value = Math.max(farthestScrollOffset.value, currentScrollOffset.value)
    }
    updatePercent(cfi)
    persistReaderState()
}

/** Scroll position inside the epub.js reader's internal scrolling container. */
function getScrollOffset(): number {
    const scroller = viewerContainer.value?.querySelector('.epub-container > div') as HTMLElement | null
    return scroller?.scrollTop ?? 0
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

function jumpToFarthest() {
    if (farthestCfi.value) rendition?.display(farthestCfi.value)
}

async function loadBook() {
    if (!viewerContainer.value) return

    book?.destroy()
    loadError.value = ''
    savedCfi.value = null
    currentCfi.value = null
    farthestCfi.value = null
    currentScrollOffset.value = 0
    farthestScrollOffset.value = 0
    totalChars.value = null
    percentRead.value = null

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
        // Show the restored percentage immediately (from the DB, before any relocation).
        updatePercent(savedCfi.value)
        // Fire-and-forget: locations generation is expensive on large books; it only fills in
        // totalChars for the tooltip/BooksView and is not needed for the percentage itself.
        ensureLocations()
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
                <template v-if="percentRead !== null">
                    <div class="mx-1 h-4 w-px bg-gemini-border"></div>
                    <span class="px-1 font-mono text-xs text-gemini-subtext"
                        :title="totalChars ? `~${totalChars.toLocaleString()} characters` : undefined">
                        {{ percentRead }}%
                    </span>
                </template>
            </div>
            <span class="text-xs text-gemini-subtext">EPUB Preview</span>
        </div>
        <div class="relative min-h-0 flex-1">
            <div ref="viewerContainer" class="absolute inset-0 overflow-hidden"></div>
            <!-- High-water-mark banner: shown when browsing behind the farthest read position -->
            <button v-if="isBehindFarthest" type="button"
                class="absolute bottom-4 left-1/2 z-10 flex -translate-x-1/2 cursor-pointer items-center gap-1.5 rounded-full bg-gemini-blue px-4 py-2 text-xs font-medium text-white shadow-md transition-all hover:opacity-90"
                @click="jumpToFarthest">
                Jump ahead to farthest read
                <ArrowRight class="h-3.5 w-3.5" />
            </button>
        </div>
        <p v-if="loadError" class="px-4 py-3 text-sm text-gemini-subtext">{{ loadError }}</p>
    </div>
</template>