<script setup lang="ts">
withDefaults(defineProps<{
    variant?: 'primary' | 'secondary'
    type?: 'button' | 'submit' | 'reset'
    disabled?: boolean
}>(), {
    variant: 'secondary',
    type: 'button',
    disabled: false,
})

const emit = defineEmits<{
    click: [event: MouseEvent]
}>()
</script>

<template>
    <button
        v-bind="$attrs"
        :type="type"
        :disabled="disabled"
        class="inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50"
        :class="variant === 'primary'
            ? 'bg-gemini-blue text-white hover:opacity-90'
            : 'border border-gemini-border bg-gemini-card text-gemini-text hover:bg-gemini-surface'"
        @click="emit('click', $event)"
    >
        <slot />
    </button>
</template>
