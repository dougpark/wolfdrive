<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
    ArrowLeft,
    ChevronLeft,
    ChevronRight,
    Info,
    Music,
    Pause,
    Play,
    SkipBack,
    SkipForward,
    Volume1,
    Volume2,
    VolumeX,
    X,
} from 'lucide-vue-next'
import StarRating from '@/components/common/StarRating.vue'
import { getRating, setRating } from '@/composables/useFileRating'
import { useMusicPlayer } from '@/composables/useMusicPlayer'
import type { MediaFile } from '@/types/media'

interface AudioMetadata {
    title: string
    artist: string
    album: string
    trackNumber: number | null
    year: number | null
    durationSec: number | null
    hasArt: boolean
}

const route = useRoute()
const router = useRouter()
const originalTitle = document.title

const isLoading = ref(true)
const errorMessage = ref('')
const trackMeta = ref<AudioMetadata | null>(null)
const artFailed = ref(false)
const metadataPanelIndex = ref<number | null>(null)
const metadataPanelMeta = ref<AudioMetadata | null>(null)
const metadataPanelLoading = ref(false)
const metadataPanelError = ref('')
let metadataRequestId = 0

const {
    playlist,
    currentIndex,
    isPlaying,
    position,
    duration,
    volume,
    loadError,
    currentTrack,
    load,
    playIndex,
    toggle,
    next,
    previous,
    seek,
    setVolume,
} = useMusicPlayer()

const albumArtUrl = computed(() => {
    const track = currentTrack()
    return track ? `/api/audio/${track.id}/art` : ''
})

const volumeIcon = computed(() => {
    if (volume.value === 0) return VolumeX
    return volume.value < 0.5 ? Volume1 : Volume2
})

const metadataPanelTrack = computed(() => {
    const index = metadataPanelIndex.value
    return index === null ? null : playlist.value[index] ?? null
})

const metadataPanelHasPrevious = computed(() => (metadataPanelIndex.value ?? 0) > 0)
const metadataPanelHasNext = computed(() => {
    const index = metadataPanelIndex.value
    return index !== null && index < playlist.value.length - 1
})

function formatTime(seconds: number) {
    if (!Number.isFinite(seconds) || seconds < 0) return '0:00'
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${mins}:${secs.toString().padStart(2, '0')}`
}

async function fetchTrackMeta(fileId: string) {
    artFailed.value = false
    try {
        const res = await fetch(`/api/audio/${fileId}/metadata`)
        if (!res.ok) throw new Error(`Metadata request failed: ${res.status}`)
        trackMeta.value = await res.json()
        if (trackMeta.value) {
            document.title = `${trackMeta.value.artist} \u2013 ${trackMeta.value.title}`
        }
    } catch (error) {
        console.error('Failed to load track metadata:', error)
        trackMeta.value = null
    }
}

async function fetchMetadataPanelMeta(fileId: string) {
    const requestId = ++metadataRequestId
    metadataPanelLoading.value = true
    metadataPanelError.value = ''
    metadataPanelMeta.value = null
    try {
        const res = await fetch(`/api/audio/${fileId}/metadata`)
        if (!res.ok) throw new Error(`Metadata request failed: ${res.status}`)
        const data = await res.json() as AudioMetadata
        if (requestId === metadataRequestId) metadataPanelMeta.value = data
    } catch (error) {
        console.error('Failed to load playlist track metadata:', error)
        if (requestId === metadataRequestId) {
            metadataPanelError.value = 'Unable to load metadata for this track.'
        }
    } finally {
        if (requestId === metadataRequestId) metadataPanelLoading.value = false
    }
}

watch(currentIndex, (index) => {
    const track = playlist.value[index]
    if (track) fetchTrackMeta(track.id)
})

watch(metadataPanelTrack, (track) => {
    if (track) fetchMetadataPanelMeta(track.id)
})

async function loadAlbum() {
    isLoading.value = true
    errorMessage.value = ''
    try {
        const id = String(route.params.id || '')
        const [fileRes, albumRes] = await Promise.all([
            fetch(`/api/files/${encodeURIComponent(id)}`),
            fetch(`/api/audio/${encodeURIComponent(id)}/album`),
        ])
        if (!fileRes.ok) throw new Error(`File request failed: ${fileRes.status}`)
        if (!albumRes.ok) throw new Error(`Album request failed: ${albumRes.status}`)

        const file = await fileRes.json() as MediaFile
        const tracks = await albumRes.json() as MediaFile[]
        const startIndex = Math.max(tracks.findIndex((t) => t.id === file.id), 0)

        load(tracks.length ? tracks : [file], startIndex)
        await fetchTrackMeta((tracks[startIndex] ?? file).id)
    } catch (error) {
        console.error('Failed to load album for playback:', error)
        errorMessage.value = 'Unable to load this album for playback.'
    } finally {
        isLoading.value = false
    }
}

function goBack() {
    router.back()
}

function onSeekInput(event: Event) {
    seek(Number((event.target as HTMLInputElement).value))
}

function onVolumeInput(event: Event) {
    setVolume(Number((event.target as HTMLInputElement).value))
}

function trackLabel(file: MediaFile) {
    return file.filename.replace(/\.[^.]+$/, '')
}

async function handleRate(file: MediaFile, rating: number) {
    const previousTags = file.tags
    const updated = await setRating(file.id, rating)
    file.tags = updated ?? previousTags
    if (updated) {
        window.dispatchEvent(new CustomEvent('wolfdrive:file-tags-updated', {
            detail: { fileId: file.id, tags: updated },
        }))
    }
}

function formatFileSize(bytes: number) {
    if (!Number.isFinite(bytes) || bytes <= 0) return '0 B'
    const units = ['B', 'KB', 'MB', 'GB', 'TB']
    const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
    const value = bytes / Math.pow(1024, exponent)
    return `${value.toFixed(value >= 10 || exponent === 0 ? 0 : 1)} ${units[exponent]}`
}

function formatDate(ms: number) {
    if (!Number.isFinite(ms) || ms <= 0) return '—'
    return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(ms))
}

function openMetadataPanel(index: number) {
    if (index < 0 || index >= playlist.value.length) return
    metadataPanelIndex.value = index
}

function closeMetadataPanel() {
    metadataPanelIndex.value = null
    metadataPanelMeta.value = null
    metadataPanelError.value = ''
}

function showPreviousMetadata() {
    if (!metadataPanelHasPrevious.value || metadataPanelIndex.value === null) return
    metadataPanelIndex.value -= 1
}

function showNextMetadata() {
    if (!metadataPanelHasNext.value || metadataPanelIndex.value === null) return
    metadataPanelIndex.value += 1
}

function onMetadataPanelKeydown(event: KeyboardEvent) {
    if (metadataPanelIndex.value === null) return
    if (event.key === 'Escape') closeMetadataPanel()
    else if (event.key === 'ArrowLeft') showPreviousMetadata()
    else if (event.key === 'ArrowRight') showNextMetadata()
    else return
    event.preventDefault()
}

onMounted(() => {
    loadAlbum()
    document.addEventListener('keydown', onMetadataPanelKeydown)
})

onBeforeUnmount(() => {
    document.removeEventListener('keydown', onMetadataPanelKeydown)
    document.title = originalTitle
})
</script>

<template>
    <main class="min-h-screen bg-gemini-bg p-8 text-gemini-text">
        <div v-if="isLoading" class="rounded-3xl border border-gemini-border bg-gemini-card p-8 shadow-sm">
            Loading album...
        </div>
        <div v-else-if="errorMessage" class="rounded-3xl border border-gemini-border bg-gemini-card p-8 shadow-sm">
            {{ errorMessage }}
        </div>

        <div v-else class="mx-auto flex max-w-5xl flex-col gap-6">
            <button type="button"
                class="flex w-fit cursor-pointer items-center gap-2 text-sm font-medium text-gemini-subtext transition-colors hover:text-gemini-text"
                @click="goBack">
                <ArrowLeft class="h-4 w-4" />
                Back
            </button>

            <div v-if="loadError"
                class="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-2.5 text-sm text-amber-600">
                {{ loadError }}
            </div>

            <div class="rounded-3xl border border-gemini-border bg-gemini-card p-8 shadow-sm">
                <div class="flex flex-col gap-8 sm:flex-row">
                    <div
                        class="flex h-56 w-56 shrink-0 items-center justify-center overflow-hidden rounded-3xl bg-gemini-surface">
                        <img v-if="!artFailed" :src="albumArtUrl" :alt="trackMeta?.album || 'Album art'"
                            class="h-full w-full object-cover" @error="artFailed = true" />
                        <Music v-else class="h-16 w-16 text-gemini-subtext" />
                    </div>

                    <div class="flex min-w-0 flex-1 flex-col justify-between">
                        <div class="min-w-0">
                            <p class="truncate text-sm font-medium text-gemini-subtext">
                                {{ trackMeta?.album || '—' }}
                            </p>
                            <h1 class="mt-1 truncate text-2xl font-semibold tracking-tight">
                                {{ trackMeta?.title || currentTrack()?.filename }}
                            </h1>
                            <p class="mt-1 truncate text-base text-gemini-subtext">
                                {{ trackMeta?.artist || '—' }}
                            </p>
                        </div>

                        <div class="mt-6">
                            <input type="range" min="0" :max="duration || 0" step="1" :value="position"
                                class="w-full accent-gemini-blue" @input="onSeekInput" />
                            <div class="mt-1 flex items-center justify-between text-xs text-gemini-subtext">
                                <span>{{ formatTime(position) }}</span>
                                <span>{{ formatTime(duration) }}</span>
                            </div>
                        </div>

                        <div class="mt-4 flex items-center gap-4">
                            <button type="button"
                                class="cursor-pointer rounded-xl p-2 text-gemini-subtext transition-colors hover:bg-gemini-surface hover:text-gemini-text disabled:cursor-not-allowed disabled:opacity-40"
                                :disabled="currentIndex <= 0" title="Previous track" @click="previous">
                                <SkipBack class="h-5 w-5" />
                            </button>
                            <button type="button"
                                class="cursor-pointer rounded-full bg-gemini-blue p-4 text-white shadow-sm transition-all hover:opacity-90"
                                :title="isPlaying ? 'Pause' : 'Play'" @click="toggle">
                                <Pause v-if="isPlaying" class="h-6 w-6" />
                                <Play v-else class="h-6 w-6" />
                            </button>
                            <button type="button"
                                class="cursor-pointer rounded-xl p-2 text-gemini-subtext transition-colors hover:bg-gemini-surface hover:text-gemini-text disabled:cursor-not-allowed disabled:opacity-40"
                                :disabled="currentIndex >= playlist.length - 1" title="Next track" @click="next">
                                <SkipForward class="h-5 w-5" />
                            </button>

                            <div class="ml-auto flex items-center gap-2">
                                <component :is="volumeIcon" class="h-4 w-4 text-gemini-subtext" />
                                <input type="range" min="0" max="1" step="0.05" :value="volume"
                                    class="w-24 accent-gemini-blue" @input="onVolumeInput" />
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <div class="rounded-3xl border border-gemini-border bg-gemini-card shadow-sm">
                <div class="border-b border-gemini-border px-6 py-4 text-sm font-semibold tracking-tight">
                    Playlist
                </div>
                <div class="divide-y divide-gemini-border">
                    <div v-for="(track, index) in playlist" :key="track.id"
                        class="flex items-center gap-2 px-4 py-2 transition-colors hover:bg-gemini-surface/60"
                        :class="index === currentIndex ? 'bg-gemini-blue/10' : ''">
                        <button type="button"
                            class="flex min-w-0 flex-1 cursor-pointer items-center justify-between gap-3 rounded-xl px-2 py-1 text-left"
                            @click="playIndex(index)">
                            <span class="min-w-0 truncate text-sm"
                                :class="index === currentIndex ? 'font-semibold text-gemini-blue' : 'text-gemini-text'">
                                {{ index + 1 }}. {{ trackLabel(track) }}
                            </span>
                            <span v-if="index === currentIndex && isPlaying" class="shrink-0 text-xs text-gemini-blue">
                                Playing
                            </span>
                        </button>
                        <div class="flex w-24 shrink-0 justify-end" @click.stop>
                            <StarRating :rating="getRating(track)" interactive
                                @rate="(value) => handleRate(track, value)" />
                        </div>
                        <button type="button"
                            class="shrink-0 cursor-pointer rounded-xl p-2 text-gemini-subtext transition-colors hover:bg-gemini-card hover:text-gemini-blue"
                            :aria-label="`Show metadata for ${trackLabel(track)}`" title="Track metadata"
                            @click="openMetadataPanel(index)">
                            <Info class="h-4 w-4" />
                        </button>
                    </div>
                </div>
            </div>
        </div>

        <div v-if="metadataPanelTrack"
            class="fixed inset-0 z-50 flex justify-end bg-black/40 p-4 backdrop-blur-sm sm:p-6" role="dialog"
            aria-modal="true" :aria-label="`Metadata for ${trackLabel(metadataPanelTrack)}`"
            @click.self="closeMetadataPanel">
            <section
                class="flex h-full w-full max-w-lg flex-col overflow-hidden rounded-3xl border border-gemini-border bg-gemini-card shadow-sm">
                <header class="flex shrink-0 items-start justify-between gap-4 border-b border-gemini-border p-6">
                    <div class="min-w-0">
                        <p class="text-xs font-medium uppercase tracking-wide text-gemini-subtext">
                            {{ (metadataPanelIndex ?? 0) + 1 }} of {{ playlist.length }}
                        </p>
                        <h2 class="mt-1 truncate text-xl font-semibold tracking-tight text-gemini-text">
                            {{ metadataPanelMeta?.title || trackLabel(metadataPanelTrack) }}
                        </h2>
                        <p class="truncate text-sm text-gemini-subtext">
                            {{ metadataPanelMeta?.artist || 'Unknown artist' }}
                        </p>
                    </div>
                    <button type="button"
                        class="cursor-pointer rounded-xl p-2 text-gemini-subtext transition-colors hover:bg-gemini-surface hover:text-gemini-text"
                        aria-label="Close metadata panel" title="Close" @click="closeMetadataPanel">
                        <X class="h-5 w-5" />
                    </button>
                </header>

                <div class="min-h-0 flex-1 overflow-auto p-6">
                    <div v-if="metadataPanelLoading" class="text-sm text-gemini-subtext">Loading metadata...</div>
                    <div v-else-if="metadataPanelError" class="text-sm text-amber-600">{{ metadataPanelError }}</div>
                    <dl v-else class="grid grid-cols-1 gap-4 text-sm sm:grid-cols-2">
                        <div class="rounded-xl bg-gemini-surface p-4">
                            <dt class="text-xs font-medium text-gemini-subtext">Title</dt>
                            <dd class="mt-1 truncate font-medium text-gemini-text">
                                {{ metadataPanelMeta?.title || trackLabel(metadataPanelTrack) }}
                            </dd>
                        </div>
                        <div class="rounded-xl bg-gemini-surface p-4">
                            <dt class="text-xs font-medium text-gemini-subtext">Artist</dt>
                            <dd class="mt-1 truncate font-medium text-gemini-text">
                                {{ metadataPanelMeta?.artist || '—' }}
                            </dd>
                        </div>
                        <div class="rounded-xl bg-gemini-surface p-4">
                            <dt class="text-xs font-medium text-gemini-subtext">Album</dt>
                            <dd class="mt-1 truncate font-medium text-gemini-text">
                                {{ metadataPanelMeta?.album || '—' }}
                            </dd>
                        </div>
                        <div class="rounded-xl bg-gemini-surface p-4">
                            <dt class="text-xs font-medium text-gemini-subtext">Track</dt>
                            <dd class="mt-1 font-medium text-gemini-text">
                                {{ metadataPanelMeta?.trackNumber ?? '—' }}
                            </dd>
                        </div>
                        <div class="rounded-xl bg-gemini-surface p-4">
                            <dt class="text-xs font-medium text-gemini-subtext">Year</dt>
                            <dd class="mt-1 font-medium text-gemini-text">{{ metadataPanelMeta?.year ?? '—' }}</dd>
                        </div>
                        <div class="rounded-xl bg-gemini-surface p-4">
                            <dt class="text-xs font-medium text-gemini-subtext">Duration</dt>
                            <dd class="mt-1 font-medium text-gemini-text">
                                {{ formatTime(metadataPanelMeta?.durationSec ?? 0) }}
                            </dd>
                        </div>
                        <div class="rounded-xl bg-gemini-surface p-4">
                            <dt class="text-xs font-medium text-gemini-subtext">File type</dt>
                            <dd class="mt-1 font-medium text-gemini-text">{{ metadataPanelTrack.mimeType }}</dd>
                        </div>
                        <div class="rounded-xl bg-gemini-surface p-4">
                            <dt class="text-xs font-medium text-gemini-subtext">File size</dt>
                            <dd class="mt-1 font-medium text-gemini-text">{{
                                formatFileSize(metadataPanelTrack.sizeBytes) }}</dd>
                        </div>
                        <div class="rounded-xl bg-gemini-surface p-4 sm:col-span-2">
                            <dt class="text-xs font-medium text-gemini-subtext">Path</dt>
                            <dd class="mt-1 break-words font-medium text-gemini-text">
                                {{ metadataPanelTrack.relativePath }}
                            </dd>
                        </div>
                        <div class="rounded-xl bg-gemini-surface p-4 sm:col-span-2">
                            <dt class="text-xs font-medium text-gemini-subtext">Modified</dt>
                            <dd class="mt-1 font-medium text-gemini-text">{{ formatDate(metadataPanelTrack.mtimeMs) }}
                            </dd>
                        </div>
                    </dl>
                </div>

                <footer class="flex shrink-0 items-center justify-between gap-3 border-t border-gemini-border p-4">
                    <button type="button"
                        class="cursor-pointer rounded-xl p-3 text-gemini-subtext transition-colors hover:bg-gemini-surface hover:text-gemini-text disabled:cursor-not-allowed disabled:opacity-40"
                        :disabled="!metadataPanelHasPrevious" title="Previous track" @click="showPreviousMetadata">
                        <ChevronLeft class="h-5 w-5" />
                    </button>
                    <button type="button"
                        class="cursor-pointer rounded-full bg-gemini-blue px-6 py-3 text-sm font-medium text-white transition-all hover:opacity-90"
                        @click="playIndex(metadataPanelIndex ?? 0)">
                        Play track
                    </button>
                    <button type="button"
                        class="cursor-pointer rounded-xl p-3 text-gemini-subtext transition-colors hover:bg-gemini-surface hover:text-gemini-text disabled:cursor-not-allowed disabled:opacity-40"
                        :disabled="!metadataPanelHasNext" title="Next track" @click="showNextMetadata">
                        <ChevronRight class="h-5 w-5" />
                    </button>
                </footer>
            </section>
        </div>
    </main>
</template>
