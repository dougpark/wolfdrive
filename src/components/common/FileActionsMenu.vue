<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
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

const isOpen = ref(false)
const rootEl = ref<HTMLElement | null>(null)
const router = useRouter()
const streamUrl = computed(() => `/api/stream/${encodeURIComponent(props.file.id)}`)
const previewUrl = computed(() => `/preview/${encodeURIComponent(props.file.id)}`)
const currentRating = computed(() => getRating(props.file))
const { open: openAiPanel } = useAiChatPanel()

function closeMenu() {
    isOpen.value = false
}

function toggleMenu() {
    isOpen.value = !isOpen.value
}

function handleDocumentClick(event: MouseEvent) {
    if (!rootEl.value?.contains(event.target as Node)) closeMenu()
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
})

onBeforeUnmount(() => {
    document.removeEventListener('click', handleDocumentClick)
    document.removeEventListener('keydown', handleKeydown)
})
</script>

<template>
    <div ref="rootEl" class="relative inline-flex" @click.stop @dblclick.stop>
        <button type="button"
            class="cursor-pointer rounded-lg p-2 text-gemini-subtext transition-colors hover:bg-gemini-surface hover:text-gemini-blue"
            :aria-expanded="isOpen" :aria-label="`Actions for ${props.file.filename}`" title="File actions"
            @click="toggleMenu">
            <slot name="trigger" :is-open="isOpen">
                <MoreVertical class="h-4 w-4" />
            </slot>
        </button>

        <div v-if="isOpen"
            class="absolute top-full z-50 mt-2 w-48 overflow-hidden rounded-xl border border-gemini-border bg-gemini-card py-1 text-sm text-gemini-text shadow-[0_8px_24px_rgba(0,0,0,0.12)]"
            :class="props.align === 'right' ? 'right-0' : 'left-0'" role="menu">
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
            <div class="group/rating relative">
                <button type="button"
                    class="flex w-full cursor-pointer items-center justify-between gap-3 px-3 py-2 text-left transition-colors hover:bg-gemini-surface"
                    role="menuitem">
                    <span class="flex items-center gap-3">
                        <Star class="h-4 w-4 text-gemini-subtext" />
                        <span>Rating</span>
                    </span>
                    <ChevronLeft class="h-3.5 w-3.5 text-gemini-subtext" />
                </button>
                <div
                    class="absolute right-full top-0 z-50 mr-1 hidden w-40 overflow-hidden rounded-xl border border-gemini-border bg-gemini-card py-1 shadow-[0_8px_24px_rgba(0,0,0,0.12)] group-hover/rating:block">
                    <button v-for="n in 6" :key="n" type="button"
                        class="flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-gemini-surface"
                        :class="currentRating === n - 1 ? 'bg-gemini-blue/10' : ''" role="menuitem"
                        @click="rate(n - 1)">
                        <StarRating :rating="n - 1" size="sm" />
                    </button>
                </div>
            </div>
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
    </div>
</template>