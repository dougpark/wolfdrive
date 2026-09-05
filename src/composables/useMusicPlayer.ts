import { onBeforeUnmount, ref, shallowRef } from 'vue'
import { Howl } from 'howler'
import type { MediaFile } from '@/types/media'

/** Drives album playback: builds a Howler instance per track and auto-advances the playlist. */
export function useMusicPlayer() {
    const playlist = ref<MediaFile[]>([])
    const currentIndex = ref(-1)
    const isPlaying = ref(false)
    const position = ref(0)
    const duration = ref(0)
    const volume = ref(1)

    const howl = shallowRef<Howl | null>(null)
    let rafId: number | null = null

    const currentTrack = () =>
        currentIndex.value >= 0 ? playlist.value[currentIndex.value] ?? null : null

    function stopProgressLoop() {
        if (rafId !== null) {
            cancelAnimationFrame(rafId)
            rafId = null
        }
    }

    function startProgressLoop() {
        stopProgressLoop()
        const tick = () => {
            const active = howl.value
            if (active) position.value = active.seek() as number
            rafId = requestAnimationFrame(tick)
        }
        rafId = requestAnimationFrame(tick)
    }

    function teardownHowl() {
        stopProgressLoop()
        howl.value?.unload()
        howl.value = null
    }

    function playIndex(index: number) {
        if (index < 0 || index >= playlist.value.length) return
        teardownHowl()
        currentIndex.value = index
        position.value = 0
        duration.value = 0

        const track = playlist.value[index]
        if (!track) return
        const trackId = track.id
        const trackExtension = track.extension
        const instance = new Howl({
            src: [`/api/stream/${trackId}`],
            html5: true,
            volume: volume.value,
            format: [trackExtension],
            onload: () => { duration.value = instance.duration() },
            onplay: () => { isPlaying.value = true; startProgressLoop() },
            onpause: () => { isPlaying.value = false; stopProgressLoop() },
            onend: () => {
                isPlaying.value = false
                stopProgressLoop()
                if (currentIndex.value < playlist.value.length - 1) playIndex(currentIndex.value + 1)
            },
        })
        howl.value = instance
        instance.play()
    }

    function load(tracks: MediaFile[], startIndex = 0) {
        playlist.value = tracks
        playIndex(startIndex)
    }

    function toggle() {
        const active = howl.value
        if (!active) return
        if (active.playing()) active.pause()
        else active.play()
    }

    function next() {
        if (currentIndex.value < playlist.value.length - 1) playIndex(currentIndex.value + 1)
    }

    function previous() {
        if (currentIndex.value > 0) playIndex(currentIndex.value - 1)
    }

    function seek(seconds: number) {
        const active = howl.value
        if (!active) return
        active.seek(seconds)
        position.value = seconds
    }

    function setVolume(value: number) {
        volume.value = value
        howl.value?.volume(value)
    }

    onBeforeUnmount(teardownHowl)

    return {
        playlist,
        currentIndex,
        isPlaying,
        position,
        duration,
        volume,
        currentTrack,
        load,
        playIndex,
        toggle,
        next,
        previous,
        seek,
        setVolume,
    }
}
