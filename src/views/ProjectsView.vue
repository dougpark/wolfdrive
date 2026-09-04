<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { Briefcase, Plus, Search, X } from 'lucide-vue-next'
import { useProjects } from '@/composables/useProjects'
import type { ProjectStatus } from '@/types/media'

const router = useRouter()
const { projects, isLoading, fetchProjects, saveProject } = useProjects()
const search = ref('')
const status = ref('')
const showCreate = ref(false)
const error = ref('')
const form = ref({ name: '', description: '', dueDate: '' })
let searchTimeout: ReturnType<typeof setTimeout>

watch([search, status], () => {
    clearTimeout(searchTimeout)
    searchTimeout = setTimeout(() => fetchProjects(search.value, status.value), 250)
})

async function createProject() {
    error.value = ''
    try {
        const project = await saveProject({ ...form.value, status: 'active' as ProjectStatus })
        showCreate.value = false
        form.value = { name: '', description: '', dueDate: '' }
        router.push(`/projects/${project.tagId}`)
    } catch (err) {
        error.value = err instanceof Error ? err.message : 'Unable to create project'
    }
}

function formatDueDate(date: string | null) {
    return date ? new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${date}T00:00:00Z`)) : 'No due date'
}

onMounted(() => fetchProjects())
</script>

<template>
    <main class="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
        <div class="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div class="flex items-center gap-3">
                <span class="flex h-10 w-10 items-center justify-center rounded-xl bg-gemini-surface">
                    <Briefcase class="h-5 w-5 text-gemini-blue" />
                </span>
                <div>
                    <h1 class="text-xl font-semibold tracking-tight">Projects</h1>
                    <p class="text-sm text-gemini-subtext">Organize files into focused workspaces.</p>
                </div>
            </div>
            <button type="button"
                class="flex items-center justify-center gap-2 rounded-xl bg-gemini-blue px-4 py-2.5 text-sm font-medium text-white hover:opacity-90"
                @click="showCreate = true">
                <Plus class="h-4 w-4" /> New project
            </button>
        </div>

        <div class="mb-5 flex flex-col gap-3 sm:flex-row">
            <div class="relative flex-1">
                <Search class="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gemini-subtext" /><input
                    v-model="search" type="search" placeholder="Search projects..."
                    class="w-full rounded-xl border border-gemini-border bg-gemini-card py-2.5 pl-10 pr-10 text-sm focus:border-gemini-blue focus:outline-none" /><button
                    v-if="search" type="button"
                    class="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-gemini-subtext"
                    aria-label="Clear search" @click="search = ''">
                    <X class="h-4 w-4" />
                </button>
            </div>
            <select v-model="status"
                class="rounded-xl border border-gemini-border bg-gemini-card px-3 py-2.5 text-sm text-gemini-text focus:border-gemini-blue focus:outline-none">
                <option value="">All statuses</option>
                <option value="active">Active</option>
                <option value="paused">Paused</option>
                <option value="completed">Completed</option>
                <option value="archived">Archived</option>
            </select>
        </div>

        <div v-if="isLoading && !projects.length" class="space-y-2">
            <div v-for="n in 5" :key="n" class="h-16 animate-pulse rounded-xl bg-gemini-card" />
        </div>
        <div v-else-if="!projects.length"
            class="rounded-2xl border border-dashed border-gemini-border bg-gemini-card p-10 text-center">
            <Briefcase class="mx-auto mb-3 h-10 w-10 text-gemini-subtext opacity-60" />
            <h2 class="font-semibold">No projects yet</h2>
            <p class="mt-1 text-sm text-gemini-subtext">Create a project to gather related files in one place.</p>
        </div>
        <div v-else class="overflow-hidden rounded-2xl border border-gemini-border bg-gemini-card">
            <div v-for="project in projects" :key="project.tagId"
                class="flex cursor-pointer items-center gap-4 border-b border-gemini-border px-5 py-4 last:border-0 hover:bg-gemini-surface"
                @dblclick="router.push(`/projects/${project.tagId}`)">
                <Briefcase class="h-5 w-5 shrink-0 text-gemini-blue" />
                <div class="min-w-0 flex-1"><button type="button"
                        class="truncate text-left text-sm font-semibold hover:text-gemini-blue"
                        @click="router.push(`/projects/${project.tagId}`)">{{ project.name }}</button>
                    <p class="truncate text-xs text-gemini-subtext">{{ project.description || 'No description' }}</p>
                </div><span class="hidden text-xs text-gemini-subtext sm:block">{{ project.fileCount }}
                    files</span><span class="hidden text-xs text-gemini-subtext md:block">{{
                        formatDueDate(project.dueDate) }}</span><span
                    class="rounded-full bg-gemini-surface px-2.5 py-1 text-xs capitalize text-gemini-subtext">{{
                    project.status }}</span>
            </div>
        </div>

        <div v-if="showCreate" class="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4"
            @click.self="showCreate = false">
            <form class="w-full max-w-lg rounded-3xl border border-gemini-border bg-gemini-card p-6 shadow-md"
                @submit.prevent="createProject">
                <div class="mb-5 flex items-center justify-between">
                    <h2 class="text-lg font-semibold">New project</h2><button type="button"
                        class="rounded-lg p-2 text-gemini-subtext hover:bg-gemini-surface" aria-label="Close"
                        @click="showCreate = false">
                        <X class="h-5 w-5" />
                    </button>
                </div><label class="mb-4 block text-sm font-medium">Name<input v-model="form.name" required
                        class="mt-1.5 w-full rounded-xl border border-gemini-border bg-gemini-card px-3 py-2.5 text-sm focus:border-gemini-blue focus:outline-none" /></label><label
                    class="mb-4 block text-sm font-medium">Description<textarea v-model="form.description" rows="3"
                        class="mt-1.5 w-full resize-y rounded-xl border border-gemini-border bg-gemini-card px-3 py-2.5 text-sm focus:border-gemini-blue focus:outline-none" /></label><label
                    class="mb-5 block text-sm font-medium">Due date<input v-model="form.dueDate" type="date"
                        class="mt-1.5 w-full rounded-xl border border-gemini-border bg-gemini-card px-3 py-2.5 text-sm focus:border-gemini-blue focus:outline-none" /></label>
                <p v-if="error" class="mb-4 text-sm text-red-500">{{ error }}</p>
                <div class="flex justify-end gap-2"><button type="button"
                        class="rounded-xl px-4 py-2.5 text-sm text-gemini-subtext hover:bg-gemini-surface"
                        @click="showCreate = false">Cancel</button><button type="submit"
                        class="rounded-xl bg-gemini-blue px-4 py-2.5 text-sm font-medium text-white hover:opacity-90">Create
                        project</button></div>
            </form>
        </div>
    </main>
</template>