<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { Bot, Paperclip, Send, Sparkles, X } from 'lucide-vue-next'
import { useAiChatPanel } from '@/composables/useAiChatPanel'

type ChatMessage = {
    id: string
    role: 'user' | 'assistant'
    content: string
}

const { isOpen, attachedFile, hasAttachment, close, clearAttachment } = useAiChatPanel()
const messages = ref<ChatMessage[]>([])
const prompt = ref('')
const isSending = ref(false)
const errorMessage = ref('')
const messageListEl = ref<HTMLElement | null>(null)

const attachmentLabel = computed(() => attachedFile.value?.filename ?? '')

async function scrollToBottom() {
    await nextTick()
    if (messageListEl.value) {
        messageListEl.value.scrollTop = messageListEl.value.scrollHeight
    }
}

async function sendPrompt() {
    const message = prompt.value.trim()
    if (!message || isSending.value) return

    const fileId = attachedFile.value?.id
    messages.value.push({ id: crypto.randomUUID(), role: 'user', content: message })
    prompt.value = ''
    errorMessage.value = ''
    isSending.value = true
    await scrollToBottom()

    try {
        const response = await fetch('/api/ai/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message, fileId }),
        })

        if (!response.ok) throw new Error(`AI request failed: ${response.status}`)

        const data = await response.json() as { response?: string }
        messages.value.push({
            id: crypto.randomUUID(),
            role: 'assistant',
            content: data.response?.trim() || 'No response returned.',
        })
    } catch (error) {
        console.error('Failed to send AI prompt:', error)
        errorMessage.value = 'Unable to reach the local AI service.'
    } finally {
        isSending.value = false
        await scrollToBottom()
    }
}

function handlePromptKeydown(event: KeyboardEvent) {
    if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault()
        sendPrompt()
    }
}

watch(isOpen, (open) => {
    if (open) scrollToBottom()
})
</script>

<template>
    <Transition enter-active-class="transition duration-200 ease-out" enter-from-class="translate-x-full opacity-70"
        enter-to-class="translate-x-0 opacity-100" leave-active-class="transition duration-150 ease-in"
        leave-from-class="translate-x-0 opacity-100" leave-to-class="translate-x-full opacity-70">
        <aside v-if="isOpen"
            class="fixed right-0 top-0 z-60 flex h-screen w-full max-w-xl flex-col border-l border-gemini-border bg-gemini-card text-gemini-text shadow-[0_0_32px_rgba(0,0,0,0.16)]">
            <header class="flex shrink-0 items-start justify-between gap-4 border-b border-gemini-border px-5 py-4">
                <div class="min-w-0">
                    <div class="flex items-center gap-2 text-sm font-semibold">
                        <Sparkles class="h-4 w-4 text-gemini-blue" />
                        <span>Local AI</span>
                    </div>
                    <p class="mt-1 text-xs text-gemini-subtext">Gemma via Ollama</p>
                </div>
                <button type="button"
                    class="cursor-pointer rounded-xl p-2 text-gemini-subtext transition-colors hover:bg-gemini-surface hover:text-gemini-text"
                    title="Close AI panel" @click="close">
                    <X class="h-5 w-5" />
                </button>
            </header>

            <div v-if="hasAttachment"
                class="mx-5 mt-4 flex items-center justify-between gap-3 rounded-xl border border-gemini-border bg-gemini-surface px-3 py-2 text-sm">
                <div class="flex min-w-0 items-center gap-2">
                    <Paperclip class="h-4 w-4 shrink-0 text-gemini-blue" />
                    <span class="truncate font-medium">{{ attachmentLabel }}</span>
                </div>
                <button type="button" class="shrink-0 cursor-pointer text-xs font-medium text-gemini-blue"
                    @click="clearAttachment">
                    Remove
                </button>
            </div>

            <div ref="messageListEl" class="min-h-0 flex-1 overflow-y-auto px-5 py-4">
                <div v-if="messages.length === 0" class="rounded-3xl border border-gemini-border bg-gemini-surface p-5">
                    <Bot class="mb-3 h-8 w-8 text-gemini-blue" />
                    <h2 class="text-base font-semibold">Ask about your media library</h2>
                    <p class="mt-2 text-sm leading-relaxed text-gemini-subtext">
                        Use Cmd+K to open this panel anywhere. Open it from a file action menu to attach that file to
                        your prompt.
                    </p>
                </div>

                <div class="flex flex-col gap-3">
                    <article v-for="message in messages" :key="message.id"
                        class="rounded-2xl px-4 py-3 text-sm leading-relaxed"
                        :class="message.role === 'user' ? 'ml-8 bg-gemini-blue text-white' : 'mr-8 bg-gemini-surface text-gemini-text'">
                        <p class="whitespace-pre-wrap">{{ message.content }}</p>
                    </article>
                </div>
            </div>

            <p v-if="errorMessage" class="px-5 pb-2 text-sm text-red-500">{{ errorMessage }}</p>

            <form class="shrink-0 border-t border-gemini-border p-4" @submit.prevent="sendPrompt">
                <textarea v-model="prompt" rows="4" placeholder="Ask the local AI..."
                    class="w-full resize-none rounded-2xl border border-gemini-border bg-gemini-bg px-4 py-3 text-sm leading-relaxed text-gemini-text placeholder:text-gemini-subtext focus:border-gemini-blue focus:outline-none"
                    @keydown="handlePromptKeydown"></textarea>
                <div class="mt-3 flex items-center justify-between gap-3">
                    <span class="text-xs text-gemini-subtext">Enter sends, Shift+Enter adds a line</span>
                    <button type="submit"
                        class="inline-flex cursor-pointer items-center gap-2 rounded-full bg-gemini-blue px-5 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                        :disabled="isSending || !prompt.trim()">
                        <Send class="h-4 w-4" />
                        <span>{{ isSending ? 'Sending...' : 'Send' }}</span>
                    </button>
                </div>
            </form>
        </aside>
    </Transition>
</template>