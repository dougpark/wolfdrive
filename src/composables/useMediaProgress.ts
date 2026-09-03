import { ref, type Ref } from 'vue'

/**
 * Shared, app-wide map of per-file viewer progress, keyed by file id.
 *
 * The payload is intentionally untyped: each media viewer reports its own shape
 * (eBooks -> percentRead, videos -> watch position, etc.) and each view reads the
 * fields it cares about. The map lives at module scope so every FileBrowser
 * instance shares one source of truth.
 */

/** Common progress payload shape. Viewers fill in whichever fields apply. */
export interface FileProgress {
    percentRead?: number | null
    /** Room to grow: positionMs, pageNumber, seen, ... */
    [key: string]: unknown
}

const progressMap: Ref<Record<string, FileProgress>> = ref({})

/** Shared viewer-progress cache. One instance app-wide. */
export function useMediaProgress() {
    /** Merge a single file's progress (called when a preview closes). O(1), no network. */
    function update(fileId: string, progress: FileProgress) {
        progressMap.value[fileId] = { ...progressMap.value[fileId], ...progress }
    }

    /** Merge a batch of rows (called when a file list loads). Each row carries its fileId. */
    function setAll(rows: Array<{ fileId: string } & FileProgress>) {
        const map = { ...progressMap.value }
        for (const row of rows) {
            const { fileId, ...progress } = row
            map[fileId] = { ...map[fileId], ...progress }
        }
        progressMap.value = map
    }

    function get(fileId: string): FileProgress | undefined {
        return progressMap.value[fileId]
    }

    return { progressMap, update, setAll, get }
}
