export interface Tag {
    id: string
    name: string
    color: string | null
}

export interface MediaFile {
    id: string
    filename: string
    relativePath: string
    extension: string
    mimeType: string
    mediaCategory: 'image' | 'video' | 'audio' | 'pdf' | 'epub' | 'document' | 'other'
    /** User-assigned library category ids, additive to the mime-derived mediaCategory. */
    customCategories: string[] | null
    /** User-assigned free-form tags. */
    tags?: Tag[]
    sizeBytes: number
    mtimeMs: number
}
