import { ref } from 'vue'
import type { Tag } from '@/types/media'

export interface TagWithCount extends Tag {
    fileCount: number
}

/** Module-level singleton cache shared by the tag picker, filter dropdown, and manager view. */
const allTags = ref<TagWithCount[]>([])
const isLoaded = ref(false)
const isLoading = ref(false)

export function useTags() {
    async function fetchTags(force = false) {
        if (isLoading.value) return
        if (isLoaded.value && !force) return
        isLoading.value = true
        try {
            const res = await fetch('/api/tags')
            if (res.ok) {
                allTags.value = await res.json()
                isLoaded.value = true
            }
        } catch (err) {
            console.error('Failed to load tags:', err)
        } finally {
            isLoading.value = false
        }
    }

    /** Find-or-create by name; refreshes the shared cache on success. */
    async function createTag(name: string): Promise<Tag | null> {
        try {
            const res = await fetch('/api/tags', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name }),
            })
            if (!res.ok) return null
            const tag = await res.json() as Tag
            if (!allTags.value.some((t) => t.id === tag.id)) {
                allTags.value = [...allTags.value, { ...tag, fileCount: 0 }].sort((a, b) => a.name.localeCompare(b.name))
            }
            return tag
        } catch (err) {
            console.error('Failed to create tag:', err)
            return null
        }
    }

    async function renameTag(id: string, name: string): Promise<boolean> {
        try {
            const res = await fetch(`/api/tags/${encodeURIComponent(id)}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name }),
            })
            if (!res.ok) return false
            const updated = await res.json() as Tag
            allTags.value = allTags.value
                .map((t) => (t.id === id ? { ...t, name: updated.name } : t))
                .sort((a, b) => a.name.localeCompare(b.name))
            return true
        } catch (err) {
            console.error('Failed to rename tag:', err)
            return false
        }
    }

    async function deleteTag(id: string): Promise<boolean> {
        try {
            const res = await fetch(`/api/tags/${encodeURIComponent(id)}`, { method: 'DELETE' })
            if (!res.ok) return false
            allTags.value = allTags.value.filter((t) => t.id !== id)
            return true
        } catch (err) {
            console.error('Failed to delete tag:', err)
            return false
        }
    }

    return {
        allTags,
        isLoading,
        fetchTags,
        createTag,
        renameTag,
        deleteTag,
    }
}
