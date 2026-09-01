<script setup lang="ts">
defineProps<{
    title: string
    description: string
}>()
</script>

<template>
    <section class="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <header class="mb-8">
            <h1 class="text-2xl font-semibold tracking-tight text-gemini-text">{{ title }}</h1>
            <p class="mt-1 text-sm leading-relaxed text-gemini-subtext">{{ description }}</p>
        </header>

        <div class="border border-dashed border-gemini-border bg-gemini-card p-8 text-center rounded-3xl">
            <h2 class="text-base font-semibold text-gemini-text">No items found</h2>
        </div>
    </section>
</template>