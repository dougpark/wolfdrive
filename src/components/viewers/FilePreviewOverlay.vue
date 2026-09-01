<script setup lang="ts">
import { defineAsyncComponent, onMounted, ref } from 'vue'
import { MdPreview } from 'md-editor-v3'
import 'md-editor-v3/lib/preview.css'
import { ChevronLeft, ChevronRight, X } from 'lucide-vue-next'
import FileActionsMenu from '@/components/common/FileActionsMenu.vue'
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
            <div class="flex shrink-0 items-center gap-1">
                <FileActionsMenu :file="props.file" />
                <button type="button"
                    class="cursor-pointer rounded-xl p-2 text-gemini-subtext transition-colors hover:bg-gemini-surface hover:text-gemini-text"
                    title="Close preview" @click="emit('close')">
                    <X class="h-5 w-5" />
                </button>
            </div>
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
                <div v-else-if="props.isMarkdown"
                    class="markdown-preview-shell h-full overflow-auto overscroll-contain rounded-xl border border-gemini-border bg-gemini-card p-6 shadow-sm md:p-8">
                    <MdPreview :modelValue="props.textContent" previewTheme="github"
                        :theme="props.isDark ? 'dark' : 'light'" />
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

<style scoped>
.markdown-preview-shell :deep(.md-editor),
.markdown-preview-shell :deep(.md-editor-dark) {
    --md-color: var(--color-gemini-text);
    --md-hover-color: var(--color-gemini-text);
    --md-bk-color: var(--color-gemini-card);
    --md-bk-color-outstand: var(--color-gemini-surface);
    --md-bk-hover-color: var(--color-gemini-surface);
    --md-border-color: var(--color-gemini-border);
    --md-border-hover-color: var(--color-gemini-border);
    --md-border-active-color: var(--color-gemini-blue);
    --md-scrollbar-bg-color: var(--color-gemini-surface);
    --md-scrollbar-thumb-color: var(--color-gemini-border);
    --md-scrollbar-thumb-hover-color: var(--color-gemini-subtext);
    --md-scrollbar-thumb-active-color: var(--color-gemini-subtext);
    min-height: 100%;
    background-color: var(--color-gemini-card);
    border: 0;
    color: var(--color-gemini-text);
    font-family: Inter, Roboto, sans-serif;
}

.markdown-preview-shell :deep(.md-editor-preview-wrapper) {
    min-height: 100%;
}

.markdown-preview-shell :deep(.md-editor-preview) {
    box-sizing: border-box;
    max-width: 920px;
    min-height: 100%;
    padding: 0;
    color: var(--color-gemini-text);
    line-height: 1.6;
    word-break: normal;
    overflow-wrap: anywhere;
}

.markdown-preview-shell :deep(.md-editor-preview h1),
.markdown-preview-shell :deep(.md-editor-preview h2),
.markdown-preview-shell :deep(.md-editor-preview h3),
.markdown-preview-shell :deep(.md-editor-preview h4),
.markdown-preview-shell :deep(.md-editor-preview h5),
.markdown-preview-shell :deep(.md-editor-preview h6) {
    color: var(--color-gemini-text);
    font-weight: 600;
    letter-spacing: 0;
}

.markdown-preview-shell :deep(.md-editor-preview p),
.markdown-preview-shell :deep(.md-editor-preview li),
.markdown-preview-shell :deep(.md-editor-preview blockquote) {
    color: var(--color-gemini-text);
}

.markdown-preview-shell :deep(.md-editor-preview a) {
    color: var(--color-gemini-blue);
}

.markdown-preview-shell :deep(.md-editor-preview code),
.markdown-preview-shell :deep(.md-editor-preview pre) {
    background-color: var(--color-gemini-surface);
    color: var(--color-gemini-text);
}
</style>
