import type { MediaFile, Tag } from '@/types/media'

const RATING_TAG_PATTERN = /^([1-5])-star$/

/** True for the mutually-exclusive "N-star" tags that back the star-rating feature. */
export function isRatingTag(name: string): boolean {
    return RATING_TAG_PATTERN.test(name)
}

/** Reads the current star rating (0-5) from a file's tags, if any. */
export function getRating(file: MediaFile): number {
    for (const tag of file.tags ?? []) {
        const match = RATING_TAG_PATTERN.exec(tag.name)
        if (match) return Number(match[1])
    }
    return 0
}

/** Sets a file's rating (0 clears it); returns the file's refreshed tag list. */
export async function setRating(fileId: string, rating: number): Promise<Tag[] | null> {
    try {
        const res = await fetch(`/api/files/${encodeURIComponent(fileId)}/rating`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ rating }),
        })
        if (!res.ok) return null
        return await res.json() as Tag[]
    } catch (err) {
        console.error('Failed to set rating:', err)
        return null
    }
}

export function useFileRating() {
    return { getRating, setRating }
}
