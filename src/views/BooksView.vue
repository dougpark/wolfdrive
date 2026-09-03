<script setup lang="ts">
import FileBrowser from '@/components/drive/FileBrowser.vue'
import { useMediaProgress } from '@/composables/useMediaProgress'
import type { MediaFile } from '@/types/media'

/**
 * BooksView injects a "Read" progress column into FileBrowser's list view via its
 * column slots. Progress comes from the reading_state rows written by EpubPreview,
 * cached in the shared media-progress map and patched live when a preview closes.
 */
const { progressMap, setAll, update } = useMediaProgress()

async function fetchProgress(files: MediaFile[]) {
    const key = files.map((f) => f.id).join(',')
    if (!key) return

    try {
        const res = await fetch(`/api/reading-state?ids=${encodeURIComponent(key)}`)
        if (!res.ok) return
        const rows: { fileId: string; percentRead: number | null }[] = await res.json()
        setAll(rows)
    } catch (err) {
        console.error('Failed to load reading progress:', err)
    }
}

/** Merge the single just-closed file's progress — no list refetch needed. */
function handleProgress(payload: Record<string, unknown> & { fileId: string }) {
    update(payload.fileId, { percentRead: (payload.percentRead as number | null) ?? null })
}
</script>

<template>
    <FileBrowser library="books" @files-loaded="fetchProgress" @progress="handleProgress">
        <template #column-header>
            <span class="hidden sm:block w-12 text-right" title="Reading progress">Read</span>
        </template>
        <template #column-cell="{ file }">
            <span class="hidden sm:block w-12 text-right font-mono"
                :class="progressMap[file.id]?.percentRead != null ? 'text-gemini-text' : 'text-gemini-subtext/50'">
                {{ progressMap[file.id]?.percentRead != null ? progressMap[file.id]!.percentRead + '%' : '—' }}
            </span>
        </template>
    </FileBrowser>
</template>