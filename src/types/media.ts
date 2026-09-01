export interface MediaFile {
    id: string
    filename: string
    relativePath: string
    extension: string
    mimeType: string
    mediaCategory: 'image' | 'video' | 'audio' | 'pdf' | 'epub' | 'document' | 'other'
    sizeBytes: number
    mtimeMs: number
}
