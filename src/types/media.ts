export interface Tag {
    id: string
    name: string
    color: string | null
}

export type ProjectStatus = 'active' | 'paused' | 'completed' | 'archived'

export interface Project {
    tagId: string
    name: string
    slug: string
    description: string | null
    status: ProjectStatus
    dueDate: string | null
    customMetadata: Record<string, unknown> | null
    fileCount: number
    createdAt: string | null
    updatedAt: string | null
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
