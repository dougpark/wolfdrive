<script setup lang="ts">
import { ref } from 'vue'
import { Star } from 'lucide-vue-next'

const props = withDefaults(defineProps<{
    rating: number
    interactive?: boolean
    size?: 'sm' | 'md'
}>(), {
    interactive: false,
    size: 'sm',
})

const emit = defineEmits<{
    (e: 'rate', value: number): void
}>()

const hoverIndex = ref(0)
const iconClass = props.size === 'sm' ? 'h-3.5 w-3.5' : 'h-5 w-5'

function displayRating(position: number) {
    const active = hoverIndex.value || props.rating
    return position <= active
}

function handleClick(position: number) {
    if (!props.interactive) return
    // Clicking the current rating's first star again clears it.
    emit('rate', position === 1 && props.rating === 1 ? 0 : position)
}
</script>

<template>
    <div class="inline-flex items-center gap-0.5" :class="{ 'cursor-pointer': interactive }"
        @mouseleave="hoverIndex = 0">
        <button v-for="position in 5" :key="position" type="button" :tabindex="interactive ? 0 : -1"
            class="text-amber-400" :class="interactive ? 'cursor-pointer' : 'cursor-default'"
            :aria-label="`Rate ${position} star${position > 1 ? 's' : ''}`"
            @mouseenter="interactive && (hoverIndex = position)" @click.stop="handleClick(position)">
            <Star :class="iconClass" :fill="displayRating(position) ? 'currentColor' : 'none'" />
        </button>
    </div>
</template>
