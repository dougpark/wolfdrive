<script setup lang="ts">
import { ref } from 'vue'
import FileBrowser from '@/components/drive/FileBrowser.vue'
import type { MediaFile } from '@/types/media'

/**
 * BooksView injects a "Read" progress column into FileBrowser's list view via its
 * column slots. Progress comes from the reading_state rows written by EpubPreview.
 */
const progressMap = ref<Record<string, number | null>>({})

async function fetchProgress(files: MediaFile[]) {
    const key = files.map((f) => f.id).join(',')
    if (!key) return

    try {
        const res = await fetch(`/api/reading-state?ids=${encodeURIComponent(key)}`)
        if (!res.ok) return
        const rows: { fileId: string; percentRead: number | null }[] = await res.json()
        const map: Record<string, number | null> = {}
        for (const row of rows) map[row.fileId] = row.percentRead
        progressMap.value = map
    } catch (err) {
        console.error('Failed to load reading progress:', err)
    }
}
</script>

<template>
    <FileBrowser library="books" @files-loaded="fetchProgress">
        <template #column-header>
            <span class="hidden sm:block w-12 text-right" title="Reading progress">Read</span>
        </template>
        <template #column-cell="{ file }">
            <span class="hidden sm:block w-12 text-right font-mono"
                :class="progressMap[file.id] != null ? 'text-gemini-text' : 'text-gemini-subtext/50'">
                {{ progressMap[file.id] != null ? progressMap[file.id] + '%' : '—' }}
            </span>
        </template>
    </FileBrowser>
</template>