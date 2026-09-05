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

// One container computes the hovered/clicked star from cursor position instead of
// attaching per-star listeners — this renders in every row of a large file list.
function positionFromEvent(event: MouseEvent): number {
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect()
    const ratio = (event.clientX - rect.left) / rect.width
    return Math.min(5, Math.max(1, Math.ceil(ratio * 5)))
}

function handleMouseMove(event: MouseEvent) {
    if (props.interactive) hoverIndex.value = positionFromEvent(event)
}

function handleClick(event: MouseEvent) {
    if (!props.interactive) return
    const position = positionFromEvent(event)
    // Clicking the current rating's first star again clears it.
    emit('rate', position === 1 && props.rating === 1 ? 0 : position)
}
</script>

<template>
    <div class="inline-flex items-center gap-0.5 text-amber-400" role="img"
        :aria-label="`Rated ${rating} out of 5 stars`" :class="{ 'cursor-pointer': interactive }"
        @mousemove="handleMouseMove" @mouseleave="hoverIndex = 0" @click.stop="handleClick">
        <Star v-for="position in 5" :key="position" :class="iconClass"
            :fill="position <= (hoverIndex || rating) ? 'currentColor' : 'none'" />
    </div>
</template>
