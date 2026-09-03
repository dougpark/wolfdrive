export interface MediaFile {
    id: string
    filename: string
    relativePath: string
    extension: string
    mimeType: string
    mediaCategory: 'image' | 'video' | 'audio' | 'pdf' | 'epub' | 'document' | 'other'
    /** User-assigned library category ids, additive to the mime-derived mediaCategory. */
    customCategories: string[] | null
    sizeBytes: number
    mtimeMs: number
}
