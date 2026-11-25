<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import BaseButton from '@/components/ui/BaseButton.vue'
import BaseInput from '@/components/ui/BaseInput.vue'
import { useTags } from '@/composables/useTags'
import type { Tag } from '@/types/media'

const props = defineProps<{ modelValue: Tag[] }>()
const emit = defineEmits<{ 'update:modelValue': [value: Tag[]] }>()
const { allTags, fetchTags, createTag, loadError } = useTags()
const query = ref('')
const error = ref('')
const busy = ref(false)
const matches = computed(() => {
    const text = query.value.trim().toLowerCase()
    if (!text) return []
    return allTags.value.filter((tag) => tag.name.toLowerCase().includes(text) && !props.modelValue.some((item) => item.id === tag.id)).slice(0, 8)
})

function select(tag: Tag) {
    if (!props.modelValue.some((item) => item.id === tag.id)) emit('update:modelValue', [...props.modelValue, tag])
    query.value = ''
    error.value = ''
}

async function add() {
    const name = query.value.trim()
    if (!name || busy.value) return
    const existing = allTags.value.find((tag) => tag.name.trim().toLowerCase().replace(/\s+/g, ' ') === name.toLowerCase().replace(/\s+/g, ' '))
    if (existing) return select(existing)
    busy.value = true
    try {
        const tag = await createTag(name)
        if (!tag) {
            error.value = 'Could not create tag.'
            return
        }
        select(tag)
    } finally {
        busy.value = false
    }
}

onMounted(() => { void fetchTags() })
</script>

<template>
    <div class="space-y-2">
        <div v-if="modelValue.length" class="flex flex-wrap gap-2">
            <BaseButton v-for="tag in modelValue" :key="tag.id" type="button"
                :aria-label="`Remove ${tag.name}`"
                @click="emit('update:modelValue', modelValue.filter((item) => item.id !== tag.id))">
                {{ tag.name }} &times;
            </BaseButton>
        </div>
        <div class="flex gap-2">
            <div class="relative flex-1">
                <BaseInput v-model="query" aria-label="Folder tag" placeholder="Find or create a folder tag"
                    @keydown.enter.prevent="add" />
                <div v-if="matches.length" class="absolute left-0 right-0 top-full z-10 mt-1 rounded-xl border border-gemini-border bg-gemini-card p-2 shadow-sm"
                    aria-label="Matching tags">
                    <BaseButton v-for="tag in matches" :key="tag.id" type="button" class="w-full justify-start"
                        @click="select(tag)">{{ tag.name }}</BaseButton>
                </div>
            </div>
            <BaseButton type="button" :disabled="busy || !query.trim()" @click="add">Add tag</BaseButton>
        </div>
        <p v-if="error || loadError" role="alert" class="text-sm text-gemini-text">{{ error || loadError }}</p>
    </div>
</template>
