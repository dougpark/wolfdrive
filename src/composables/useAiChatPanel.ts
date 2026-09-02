import { computed, ref } from 'vue'
import type { MediaFile } from '@/types/media'

const isOpen = ref(false)
const attachedFile = ref<MediaFile | null>(null)

export function useAiChatPanel() {
    const hasAttachment = computed(() => attachedFile.value !== null)

    function open(file?: MediaFile | null) {
        attachedFile.value = file ?? null
        isOpen.value = true
    }

    function close() {
        isOpen.value = false
    }

    function toggle(file?: MediaFile | null) {
        if (isOpen.value) {
            close()
            return
        }

        open(file)
    }

    function clearAttachment() {
        attachedFile.value = null
    }

    return {
        isOpen,
        attachedFile,
        hasAttachment,
        open,
        close,
        toggle,
        clearAttachment,
    }
}