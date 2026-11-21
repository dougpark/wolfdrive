<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref } from 'vue'
import BaseButton from './ui/BaseButton.vue'
import { X } from 'lucide-vue-next'

defineProps<{ title: string }>()
const emit = defineEmits<{ close: [] }>()
const dialog = ref<HTMLDialogElement | null>(null)
onMounted(() => dialog.value?.showModal())
onBeforeUnmount(() => dialog.value?.close())
</script>

<template>
    <Teleport to="body">
        <dialog ref="dialog" :aria-label="title"
            class="m-auto max-h-full w-full max-w-3xl overflow-y-auto rounded-3xl border border-gemini-border bg-gemini-card p-8 text-gemini-text shadow-sm backdrop:bg-gemini-text/40"
            @cancel.prevent="emit('close')" @click="event => { if (event.target === dialog) emit('close') }">
            <header class="mb-6 flex items-center justify-between gap-4">
                <slot name="header"><h2 class="text-lg font-semibold tracking-tight">{{ title }}</h2></slot>
                <BaseButton aria-label="Close dialog" @click="emit('close')"><X class="h-4 w-4" /></BaseButton>
            </header>
            <slot name="body" />
        </dialog>
    </Teleport>
</template>
