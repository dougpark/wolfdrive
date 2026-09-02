import {
    Book,
    BookOpen,
    Cpu,
    File,
    FileText,
    Film,
    Gamepad2,
    HardDrive,
    Image as ImageIcon,
    Music,
} from 'lucide-vue-next'
import type { FunctionalComponent } from 'vue'

/** `mediaCategory` values produced by the scanner. */
export type MediaCategory = 'image' | 'video' | 'audio' | 'pdf' | 'epub' | 'document' | 'other'

export interface LibraryCategory {
    id: string
    label: string
    description: string
    icon: FunctionalComponent
    /** Empty means "no filter" (all files). */
    categories: MediaCategory[]
}

export const LIBRARY_CATEGORIES = {
    files: {
        id: 'files',
        label: 'Files',
        description: 'Every indexed file across your scanned directories.',
        icon: HardDrive,
        categories: [],
    },
    photos: {
        id: 'photos',
        label: 'Photos',
        description: 'Your image library.',
        icon: ImageIcon,
        categories: ['image'],
    },
    videos: {
        id: 'videos',
        label: 'Videos',
        description: 'Your video library.',
        icon: Film,
        categories: ['video'],
    },
    books: {
        id: 'books',
        label: 'Books',
        description: 'eBooks available for reading.',
        icon: Book,
        categories: ['epub'],
    },
    documents: {
        id: 'documents',
        label: 'Documents',
        description: 'PDFs, Markdown, text and office documents.',
        icon: FileText,
        categories: ['document', 'pdf'],
    },
    music: {
        id: 'music',
        label: 'Music',
        description: 'Your audio library.',
        icon: Music,
        categories: ['audio'],
    },
    movies: {
        id: 'movies',
        label: 'Movies',
        description: 'Feature-length video titles.',
        icon: Film,
        categories: ['video'],
    },
    'tv-shows': {
        id: 'tv-shows',
        label: 'TV Shows',
        description: 'Series and episodes.',
        icon: Film,
        categories: ['video'],
    },
    games: {
        id: 'games',
        label: 'Games',
        description: 'Game images and ROMs.',
        icon: Gamepad2,
        categories: ['other'],
    },
    software: {
        id: 'software',
        label: 'Software',
        description: 'Applications, packages and installers.',
        icon: Cpu,
        categories: ['other'],
    },
} as const satisfies Record<string, LibraryCategory>

export type LibraryCategoryId = keyof typeof LIBRARY_CATEGORIES

/** Media-type filter chips shown on the unfiltered Files view. */
export const MEDIA_FILTERS: { id: MediaCategory | 'all'; label: string; icon: FunctionalComponent }[] = [
    { id: 'all', label: 'All Files', icon: HardDrive },
    { id: 'image', label: 'Photos', icon: ImageIcon },
    { id: 'video', label: 'Videos', icon: Film },
    { id: 'audio', label: 'Music', icon: Music },
    { id: 'pdf', label: 'PDFs', icon: BookOpen },
    { id: 'epub', label: 'eBooks', icon: Book },
    { id: 'document', label: 'Documents', icon: FileText },
]

export function getCategoryIcon(category: string | null | undefined): FunctionalComponent {
    switch (category) {
        case 'image': return ImageIcon
        case 'video': return Film
        case 'audio': return Music
        case 'pdf': return BookOpen
        case 'epub': return Book
        case 'document': return FileText
        default: return File
    }
}
