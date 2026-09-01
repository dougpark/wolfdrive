<script setup lang="ts">
import { defineAsyncComponent, onMounted, ref } from 'vue'
import { MdPreview } from 'md-editor-v3'
import 'md-editor-v3/lib/preview.css'
import { ChevronLeft, ChevronRight, X } from 'lucide-vue-next'
import type { MediaFile } from '@/types/media'

const EpubPreview = defineAsyncComponent(() => import('@/components/viewers/EpubPreview.vue'))

const props = defineProps<{
    file: MediaFile
    isDark: boolean
    isMarkdown: boolean
    isText: boolean
    isTextLoading: boolean
    textContent: string
    hasPrevious: boolean
    hasNext: boolean
}>()

const emit = defineEmits<{
    (e: 'close'): void
    (e: 'previous'): void
    (e: 'next'): void
}>()

const rootEl = ref<HTMLElement | null>(null)

function handleKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape') emit('close')
    else if (event.key === 'ArrowLeft') emit('previous')
    else if (event.key === 'ArrowRight') emit('next')
}

onMounted(() => {
    rootEl.value?.focus()
})
</script>

<template>
    <div ref="rootEl" class="fixed inset-0 z-50 flex h-screen w-screen flex-col bg-gemini-bg text-gemini-text"
        role="dialog" aria-modal="true" :aria-label="`Preview ${props.file.filename}`" tabindex="-1"
        @keydown="handleKeydown">
        <header class="flex shrink-0 items-center justify-between gap-4 border-b border-gemini-border px-6 py-4">
            <div class="min-w-0">
                <h2 class="truncate text-base font-semibold">{{ props.file.filename }}</h2>
                <p class="truncate text-xs text-gemini-subtext">{{ props.file.relativePath }}</p>
            </div>
            <button type="button"
                class="shrink-0 cursor-pointer rounded-xl p-2 text-gemini-subtext transition-colors hover:bg-gemini-surface hover:text-gemini-text"
                title="Close preview" @click="emit('close')">
                <X class="h-5 w-5" />
            </button>
        </header>

        <div class="relative min-h-0 flex-1 bg-gemini-surface">
            <button v-if="hasPrevious" type="button"
                class="absolute left-4 top-1/2 z-10 -translate-y-1/2 cursor-pointer rounded-full bg-gemini-card/90 p-3 text-gemini-text shadow-md transition-colors hover:bg-gemini-card"
                title="Previous file" @click="emit('previous')">
                <ChevronLeft class="h-5 w-5" />
            </button>
            <button v-if="hasNext" type="button"
                class="absolute right-4 top-1/2 z-10 -translate-y-1/2 cursor-pointer rounded-full bg-gemini-card/90 p-3 text-gemini-text shadow-md transition-colors hover:bg-gemini-card"
                title="Next file" @click="emit('next')">
                <ChevronRight class="h-5 w-5" />
            </button>

            <div class="h-full w-full p-4">
                <img v-if="props.file.mediaCategory === 'image'" :src="`/api/stream/${props.file.id}`"
                    :alt="props.file.filename" class="h-full w-full object-contain" />
                <video v-else-if="props.file.mediaCategory === 'video'" :src="`/api/stream/${props.file.id}`" controls
                    class="h-full w-full"></video>
                <audio v-else-if="props.file.mediaCategory === 'audio'" :src="`/api/stream/${props.file.id}`" controls
                    class="h-full w-full"></audio>
                <div v-else-if="props.isMarkdown" class="h-full overflow-auto overscroll-contain rounded-xl">
                    <MdPreview :modelValue="props.textContent" :theme="props.isDark ? 'dark' : 'light'" />
                </div>
                <pre v-else-if="props.isText"
                    class="h-full overflow-auto overscroll-contain rounded-xl bg-gemini-surface p-4 font-mono text-sm text-gemini-text whitespace-pre-wrap">{{ props.isTextLoading ? 'Loading preview...' : props.textContent }}</pre>
                <EpubPreview v-else-if="props.file.mediaCategory === 'epub'" :url="`/api/stream/${props.file.id}`"
                    :isDark="props.isDark" />
                <iframe v-else :src="`/api/stream/${props.file.id}`" :title="props.file.filename"
                    class="h-full w-full rounded-xl border border-gemini-border bg-gemini-card"
                    style="color-scheme: light"></iframe>
            </div>
        </div>
    </div>
</template>
