<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ChevronLeft, Download, ExternalLink, MessageSquareText, MoreVertical, PlayCircle, Star, Tag as TagIcon, Tags } from 'lucide-vue-next'
import { useAiChatPanel } from '@/composables/useAiChatPanel'
import { getRating, setRating } from '@/composables/useFileRating'
import StarRating from '@/components/common/StarRating.vue'
import type { MediaFile } from '@/types/media'

const props = withDefaults(defineProps<{
    file: MediaFile
    align?: 'left' | 'right'
}>(), {
    align: 'right',
})

const emit = defineEmits<{
    (e: 'edit-categories'): void
    (e: 'edit-tags'): void
}>()

// Menu/submenu width constants (must match the Tailwind w-48/w-40 classes below) —
// used to compute fixed viewport positions since the panels are teleported to <body>
// to escape the row list's `overflow-hidden` ancestor.
const MENU_WIDTH = 192
const SUBMENU_WIDTH = 160

const isOpen = ref(false)
const isRatingOpen = ref(false)
const rootEl = ref<HTMLElement | null>(null)
const triggerEl = ref<HTMLElement | null>(null)
const menuEl = ref<HTMLElement | null>(null)
const ratingTriggerEl = ref<HTMLElement | null>(null)
const submenuEl = ref<HTMLElement | null>(null)
const menuPos = ref({ top: 0, left: 0 })
const submenuPos = ref({ top: 0, left: 0 })
let closeRatingTimer: ReturnType<typeof setTimeout> | null = null

const router = useRouter()
const streamUrl = computed(() => `/api/stream/${encodeURIComponent(props.file.id)}`)
const previewUrl = computed(() => `/preview/${encodeURIComponent(props.file.id)}`)
const currentRating = computed(() => getRating(props.file))
const { open: openAiPanel } = useAiChatPanel()

function positionMenu() {
    const trigger = triggerEl.value
    if (!trigger) return
    const rect = trigger.getBoundingClientRect()
    const menuHeight = menuEl.value?.offsetHeight ?? 260
    let top = rect.bottom + 4
    if (top + menuHeight > window.innerHeight) top = Math.max(4, rect.top - menuHeight - 4)
    let left = props.align === 'right' ? rect.right - MENU_WIDTH : rect.left
    left = Math.min(Math.max(4, left), window.innerWidth - MENU_WIDTH - 4)
    menuPos.value = { top, left }
}

function positionSubmenu() {
    const trigger = ratingTriggerEl.value
    if (!trigger) return
    const rect = trigger.getBoundingClientRect()
    const submenuHeight = submenuEl.value?.offsetHeight ?? 280
    let left = rect.left - SUBMENU_WIDTH - 4
    if (left < 4) left = rect.right + 4
    const top = Math.min(rect.top, window.innerHeight - submenuHeight - 4)
    submenuPos.value = { top: Math.max(4, top), left }
}

function closeMenu() {
    isOpen.value = false
    isRatingOpen.value = false
}

async function toggleMenu() {
    isOpen.value = !isOpen.value
    if (isOpen.value) {
        await nextTick()
        positionMenu()
    } else {
        isRatingOpen.value = false
    }
}

function openRatingSubmenu() {
    if (closeRatingTimer) {
        clearTimeout(closeRatingTimer)
        closeRatingTimer = null
    }
    isRatingOpen.value = true
    nextTick(positionSubmenu)
}

function scheduleCloseSubmenu() {
    closeRatingTimer = setTimeout(() => { isRatingOpen.value = false }, 150)
}

function handleDocumentClick(event: MouseEvent) {
    const target = event.target as Node
    if (rootEl.value?.contains(target) || menuEl.value?.contains(target) || submenuEl.value?.contains(target)) return
    closeMenu()
}

function handleKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape') closeMenu()
}

function downloadFile() {
    const link = document.createElement('a')
    link.href = streamUrl.value
    link.download = props.file.filename
    document.body.append(link)
    link.click()
    link.remove()
    closeMenu()
}

function openInNewTab() {
    window.open(previewUrl.value, '_blank', 'noopener,noreferrer')
    closeMenu()
}

function playAlbum() {
    router.push(`/music/play/${props.file.id}`)
    closeMenu()
}

async function rate(value: number) {
    const updated = await setRating(props.file.id, value)
    if (updated) props.file.tags = updated
    closeMenu()
}

function askLocalAi() {
    openAiPanel(props.file)
    closeMenu()
}

function editCategories() {
    emit('edit-categories')
    closeMenu()
}

function editTags() {
    emit('edit-tags')
    closeMenu()
}

onMounted(() => {
    document.addEventListener('click', handleDocumentClick)
    document.addEventListener('keydown', handleKeydown)
    // 'scroll' doesn't bubble, so a capturing window listener is needed to catch
    // scrolling inside AppLayout's <main> and close the now-detached fixed menu.
    window.addEventListener('scroll', closeMenu, true)
})

onBeforeUnmount(() => {
    document.removeEventListener('click', handleDocumentClick)
    document.removeEventListener('keydown', handleKeydown)
    window.removeEventListener('scroll', closeMenu, true)
    if (closeRatingTimer) clearTimeout(closeRatingTimer)
})
</script>

<template>
    <div ref="rootEl" class="relative inline-flex" @click.stop @dblclick.stop>
        <button ref="triggerEl" type="button"
            class="cursor-pointer rounded-lg p-2 text-gemini-subtext transition-colors hover:bg-gemini-surface hover:text-gemini-blue"
            :aria-expanded="isOpen" :aria-label="`Actions for ${props.file.filename}`" title="File actions"
            @click="toggleMenu">
            <slot name="trigger" :is-open="isOpen">
                <MoreVertical class="h-4 w-4" />
            </slot>
        </button>

        <Teleport to="body">
            <div v-if="isOpen" ref="menuEl" :style="{ top: `${menuPos.top}px`, left: `${menuPos.left}px` }"
                class="fixed z-50 w-48 overflow-visible rounded-xl border border-gemini-border bg-gemini-card py-1 text-sm text-gemini-text shadow-[0_8px_24px_rgba(0,0,0,0.12)]"
                role="menu">
                <button type="button"
                    class="flex w-full cursor-pointer items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-gemini-surface"
                    role="menuitem" @click="downloadFile">
                    <Download class="h-4 w-4 text-gemini-subtext" />
                    <span>Download</span>
                </button>
                <button v-if="props.file.mediaCategory === 'audio'" type="button"
                    class="flex w-full cursor-pointer items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-gemini-surface"
                    role="menuitem" @click="playAlbum">
                    <PlayCircle class="h-4 w-4 text-gemini-subtext" />
                    <span>Play</span>
                </button>
                <button type="button"
                    class="flex w-full cursor-pointer items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-gemini-surface"
                    role="menuitem" @click="openInNewTab">
                    <ExternalLink class="h-4 w-4 text-gemini-subtext" />
                    <span>Open in new tab</span>
                </button>
                <button ref="ratingTriggerEl" type="button"
                    class="flex w-full cursor-pointer items-center justify-between gap-3 px-3 py-2 text-left transition-colors hover:bg-gemini-surface"
                    role="menuitem" @mouseenter="openRatingSubmenu" @mouseleave="scheduleCloseSubmenu">
                    <span class="flex items-center gap-3">
                        <Star class="h-4 w-4 text-gemini-subtext" />
                        <span>Rating</span>
                    </span>
                    <ChevronLeft class="h-3.5 w-3.5 text-gemini-subtext" />
                </button>
                <button type="button"
                    class="flex w-full cursor-pointer items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-gemini-surface"
                    role="menuitem" @click="editCategories">
                    <Tags class="h-4 w-4 text-gemini-subtext" />
                    <span>Edit categories</span>
                </button>
                <button type="button"
                    class="flex w-full cursor-pointer items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-gemini-surface"
                    role="menuitem" @click="editTags">
                    <TagIcon class="h-4 w-4 text-gemini-subtext" />
                    <span>Manage tags</span>
                </button>
                <button type="button"
                    class="flex w-full cursor-pointer items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-gemini-surface"
                    role="menuitem" @click="askLocalAi">
                    <MessageSquareText class="h-4 w-4 text-gemini-subtext" />
                    <span>Ask local AI</span>
                </button>
            </div>
        </Teleport>

        <Teleport to="body">
            <div v-if="isRatingOpen" ref="submenuEl"
                :style="{ top: `${submenuPos.top}px`, left: `${submenuPos.left}px` }"
                class="fixed z-[60] w-40 overflow-hidden rounded-xl border border-gemini-border bg-gemini-card py-1 shadow-[0_8px_24px_rgba(0,0,0,0.12)]"
                @mouseenter="openRatingSubmenu" @mouseleave="scheduleCloseSubmenu">
                <button v-for="n in 6" :key="n" type="button"
                    class="flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-gemini-surface"
                    :class="currentRating === n - 1 ? 'bg-gemini-blue/10' : ''" role="menuitem" @click="rate(n - 1)">
                    <StarRating :rating="n - 1" size="sm" />
                </button>
            </div>
        </Teleport>
    </div>
</template>