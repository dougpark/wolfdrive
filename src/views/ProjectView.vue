<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ArrowLeft, Briefcase, Pencil, X } from 'lucide-vue-next'
import FileBrowser from '@/components/drive/FileBrowser.vue'
import { useProjects } from '@/composables/useProjects'
import type { Project, ProjectStatus } from '@/types/media'

const route = useRoute()
const router = useRouter()
const { updateProject } = useProjects()
const project = ref<Project | null>(null)
const isLoading = ref(true)
const isEditing = ref(false)
const error = ref('')
const form = ref({ name: '', description: '', status: 'active' as ProjectStatus, dueDate: '' })

async function loadProject() {
    isLoading.value = true
    const res = await fetch(`/api/projects/${encodeURIComponent(String(route.params.id))}`)
    if (!res.ok) { router.replace('/projects'); return }
    project.value = await res.json() as Project
    form.value = { name: project.value.name, description: project.value.description || '', status: project.value.status, dueDate: project.value.dueDate || '' }
    isLoading.value = false
}

async function save() {
    if (!project.value) return
    error.value = ''
    try { project.value = await updateProject(project.value.tagId, form.value); isEditing.value = false } catch (err) { error.value = err instanceof Error ? err.message : 'Unable to update project' }
}

onMounted(loadProject)
</script>

<template>
    <main v-if="!isLoading && project" class="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <button type="button" class="mb-5 flex items-center gap-2 text-sm text-gemini-subtext hover:text-gemini-text"
            @click="router.push('/projects')">
            <ArrowLeft class="h-4 w-4" /> Projects
        </button>
        <header
            class="mb-6 flex flex-col gap-4 rounded-2xl border border-gemini-border bg-gemini-card p-5 sm:flex-row sm:items-start sm:justify-between">
            <div class="flex min-w-0 items-start gap-3"><span
                    class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gemini-surface">
                    <Briefcase class="h-5 w-5 text-gemini-blue" />
                </span>
                <div class="min-w-0">
                    <h1 class="truncate text-xl font-semibold">{{ project.name }}</h1>
                    <p class="mt-1 text-sm text-gemini-subtext">{{ project.description || 'No description' }}</p>
                    <div class="mt-3 flex flex-wrap gap-2 text-xs text-gemini-subtext"><span
                            class="rounded-full bg-gemini-surface px-2.5 py-1 capitalize">{{ project.status
                            }}</span><span>{{ project.fileCount }} files</span><span v-if="project.dueDate">Due {{
                            project.dueDate }}</span></div>
                </div>
            </div><button type="button"
                class="flex items-center gap-2 self-start rounded-xl border border-gemini-border px-3 py-2 text-sm hover:bg-gemini-surface"
                @click="isEditing = true">
                <Pencil class="h-4 w-4" /> Edit
            </button>
        </header>
        <FileBrowser :scope-tag-ids="[project.tagId]" />
        <div v-if="isEditing" class="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4"
            @click.self="isEditing = false">
            <form class="w-full max-w-lg rounded-3xl border border-gemini-border bg-gemini-card p-6 shadow-md"
                @submit.prevent="save">
                <div class="mb-5 flex items-center justify-between">
                    <h2 class="text-lg font-semibold">Edit project</h2><button type="button"
                        class="rounded-lg p-2 text-gemini-subtext hover:bg-gemini-surface" aria-label="Close"
                        @click="isEditing = false">
                        <X class="h-5 w-5" />
                    </button>
                </div><label class="mb-4 block text-sm font-medium">Name<input v-model="form.name" required
                        class="mt-1.5 w-full rounded-xl border border-gemini-border bg-gemini-card px-3 py-2.5 text-sm focus:border-gemini-blue focus:outline-none" /></label><label
                    class="mb-4 block text-sm font-medium">Description<textarea v-model="form.description" rows="3"
                        class="mt-1.5 w-full resize-y rounded-xl border border-gemini-border bg-gemini-card px-3 py-2.5 text-sm focus:border-gemini-blue focus:outline-none" /></label>
                <div class="mb-5 grid gap-4 sm:grid-cols-2"><label class="block text-sm font-medium">Status<select
                            v-model="form.status"
                            class="mt-1.5 w-full rounded-xl border border-gemini-border bg-gemini-card px-3 py-2.5 text-sm">
                            <option value="active">Active</option>
                            <option value="paused">Paused</option>
                            <option value="completed">Completed</option>
                            <option value="archived">Archived</option>
                        </select></label><label class="block text-sm font-medium">Due date<input v-model="form.dueDate"
                            type="date"
                            class="mt-1.5 w-full rounded-xl border border-gemini-border bg-gemini-card px-3 py-2.5 text-sm" /></label>
                </div>
                <p v-if="error" class="mb-4 text-sm text-red-500">{{ error }}</p>
                <div class="flex justify-end gap-2"><button type="button"
                        class="rounded-xl px-4 py-2.5 text-sm text-gemini-subtext hover:bg-gemini-surface"
                        @click="isEditing = false">Cancel</button><button type="submit"
                        class="rounded-xl bg-gemini-blue px-4 py-2.5 text-sm font-medium text-white hover:opacity-90">Save
                        changes</button></div>
            </form>
        </div>
    </main>
    <div v-else class="p-8 text-sm text-gemini-subtext">Loading project...</div>
</template>