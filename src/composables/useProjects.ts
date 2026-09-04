import { ref } from 'vue'
import type { Project, ProjectStatus } from '@/types/media'

const projects = ref<Project[]>([])
const isLoading = ref(false)

export function useProjects() {
    async function fetchProjects(search = '', status = '') {
        isLoading.value = true
        try {
            const params = new URLSearchParams()
            if (search.trim()) params.set('search', search.trim())
            if (status) params.set('status', status)
            const res = await fetch(`/api/projects?${params.toString()}`)
            if (!res.ok) throw new Error('Failed to load projects')
            projects.value = await res.json() as Project[]
        } finally {
            isLoading.value = false
        }
    }

    async function saveProject(payload: { name: string; description: string; status: ProjectStatus; dueDate: string }) {
        const res = await fetch('/api/projects', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        })
        if (!res.ok) throw new Error((await res.json()).error || 'Unable to create project')
        const project = await res.json() as Project
        projects.value = [...projects.value, project].sort((a, b) => a.name.localeCompare(b.name))
        return project
    }

    async function updateProject(id: string, payload: Partial<Pick<Project, 'name' | 'description' | 'status' | 'dueDate'>>) {
        const res = await fetch(`/api/projects/${encodeURIComponent(id)}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        })
        if (!res.ok) throw new Error((await res.json()).error || 'Unable to update project')
        return await res.json() as Project
    }

    return { projects, isLoading, fetchProjects, saveProject, updateProject }
}