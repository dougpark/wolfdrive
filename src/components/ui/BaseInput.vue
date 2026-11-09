<script setup lang="ts">
withDefaults(defineProps<{
    modelValue: string
    type?: string
    placeholder?: string
}>(), {
    type: 'text',
    placeholder: '',
})

const emit = defineEmits<{
    'update:modelValue': [value: string]
}>()
</script>

<template>
    <input
        v-bind="$attrs"
        :type="type"
        :value="modelValue"
        :placeholder="placeholder"
        class="w-full rounded-xl border border-gemini-border bg-gemini-card px-3 py-2.5 text-sm text-gemini-text focus:border-gemini-blue focus:outline-none"
        @input="emit('update:modelValue', ($event.target as HTMLInputElement).value)"
    />
</template>
