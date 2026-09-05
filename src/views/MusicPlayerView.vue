<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
    ArrowLeft,
    Music,
    Pause,
    Play,
    SkipBack,
    SkipForward,
    Volume1,
    Volume2,
    VolumeX,
} from 'lucide-vue-next'
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

watch(currentIndex, (index) => {
    const track = playlist.value[index]
    if (track) fetchTrackMeta(track.id)
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

onMounted(loadAlbum)

onBeforeUnmount(() => {
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
                    <button v-for="(track, index) in playlist" :key="track.id" type="button"
                        class="flex w-full cursor-pointer items-center justify-between gap-3 px-6 py-3 text-left transition-colors hover:bg-gemini-surface/60"
                        :class="index === currentIndex ? 'bg-gemini-blue/10' : ''" @click="playIndex(index)">
                        <span class="min-w-0 truncate text-sm"
                            :class="index === currentIndex ? 'font-semibold text-gemini-blue' : 'text-gemini-text'">
                            {{ index + 1 }}. {{ trackLabel(track) }}
                        </span>
                        <span v-if="index === currentIndex && isPlaying" class="shrink-0 text-xs text-gemini-blue">
                            Playing
                        </span>
                    </button>
                </div>
            </div>
        </div>
    </main>
</template>
