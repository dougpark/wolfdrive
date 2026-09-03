/**
 * Pure, framework-agnostic library-category data shared by the Vue client
 * (`libraryCategories.ts`) and the Bun/Hono API (`index.ts`).
 * Do NOT import Vue or lucide-vue-next here.
 */

/** `mediaCategory` values produced by the scanner. */
export type MediaCategory = 'image' | 'video' | 'audio' | 'pdf' | 'epub' | 'document' | 'other'

/** Library ids the user can manually assign to a file via "Edit categories". */
export const SELECTABLE_LIBRARY_IDS = [
    'photos',
    'videos',
    'books',
    'documents',
    'music',
    'movies',
    'tv-shows',
    'games',
    'software',
] as const

export type SelectableLibraryId = (typeof SELECTABLE_LIBRARY_IDS)[number]

/**
 * Default (mime-derived) media categories backing each library.
 * An empty array means the library has no mime-derived membership —
 * files only appear there via manual user tags.
 */
export const LIBRARY_CATEGORY_MIME_MAP: Record<SelectableLibraryId | 'files', MediaCategory[]> = {
    files: [],
    photos: ['image'],
    videos: ['video'],
    books: ['epub'],
    documents: ['document', 'pdf'],
    music: ['audio'],
    movies: ['video'],
    'tv-shows': ['video'],
    games: [],
    software: [],
}

/** Libraries with no mime-derived default; membership comes only from manual tags. */
export const CUSTOM_ONLY_LIBRARY_IDS: ReadonlySet<string> = new Set(['games', 'software'])
