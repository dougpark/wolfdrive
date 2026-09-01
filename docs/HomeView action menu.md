To keep a list view clean while scaling to dozens of potential actions, professional media and asset managers (like macOS Finder, Google Drive, and Plex) rely on a Tiered Action Pattern:
1. Primary Action (Direct Click): Clicking anywhere on the row triggers the main viewer/player (e.g., opens the PDF previewer, starts playing music, or opens the EPUB reader).
2. Hover Actions (Quick Access): Quick inline icons appear on row hover for high-frequency actions (e.g., Quick View Eye, Favorite Star, Options MoreVertical).
3. Contextual Dropdown Menu (Overflow): Clicking the ... button (or right-clicking the row) opens a structured dropdown categorized into clear visual groups.
UI Architecture for Scalable Actions
Grouped Action Menu Structure:
• Primary: Open Preview, Download
• Organization: Add to Collection, Add to Playlist / Album, Favorite (Star)
• File Operations: Rename, Move to Folder, Copy Path
• System & Info: File Properties (Info), Show in File Manager / Host Explorer
Vue Implementation (HomeView.vue)
Here is how to implement inline hover actions, right-click context menu support, and an expandable dropdown menu cleanly in Vue 3:
<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { 
  Eye, 
  MoreVertical, 
  Download, 
  Star, 
  FolderInput, 
  Edit3, 
  Info, 
  FolderSearch,
  PlusCircle
} from 'lucide-vue-next'

const activeMenuId = ref<string | null>(null)

function toggleMenu(id: string, e: Event) {
  e.stopPropagation()
  activeMenuId.value = activeMenuId.value === id ? null : id
}

function handleRowClick(file: any) {
  console.log('Open primary view for:', file.filename)
}

function handleAction(action: string, file: any) {
  console.log(`Action: ${action} on ${file.filename}`)
  activeMenuId.value = null
}

// Close menu when clicking outside
function handleOutsideClick() {
  activeMenuId.value = null
}

onMounted(() => window.addEventListener('click', handleOutsideClick))
onUnmounted(() => window.removeEventListener('click', handleOutsideClick))
</script>

<template>
  <!-- LIST VIEW WITH TIERED ACTIONS -->
  <div class="bg-gemini-card border border-gemini-border rounded-2xl overflow-hidden divide-y divide-gemini-border">
    <div
      v-for="file in files"
      :key="file.id"
      @click="handleRowClick(file)"
      class="group relative flex items-center justify-between px-5 py-3.5 hover:bg-gemini-surface/60 transition-colors cursor-pointer"
    >
      <!-- Left: Category Icon & File Metadata -->
      <div class="flex items-center gap-3.5 min-w-0 flex-1 pr-4">
        <component 
          :is="getCategoryIcon(file.mediaCategory)" 
          class="h-5 w-5 text-gemini-blue shrink-0"
        />
        <div class="min-w-0 flex-1">
          <span class="block text-sm font-medium text-gemini-text truncate group-hover:text-gemini-blue transition-colors">
            {{ file.filename }}
          </span>
          <span class="block text-xs font-mono text-gemini-subtext truncate">
            {{ file.relativePath }}
          </span>
        </div>
      </div>

      <!-- Right: File Details + Hover Actions -->
      <div class="flex items-center gap-4 text-xs text-gemini-subtext shrink-0">
        <span class="uppercase font-mono w-12 text-right hidden sm:inline">{{ file.extension }}</span>
        <span class="w-20 text-right font-mono">{{ formatBytes(file.sizeBytes) }}</span>

        <!-- Hover Quick Actions (Shown on row hover) -->
        <div class="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <!-- Quick View Button -->
          <button
            @click.stop="handleAction('view', file)"
            class="p-1.5 text-gemini-subtext hover:text-gemini-blue hover:bg-gemini-surface rounded-lg transition-colors"
            title="Quick View"
          >
            <Eye class="h-4 w-4" />
          </button>

          <!-- Favorite Button -->
          <button
            @click.stop="handleAction('favorite', file)"
            class="p-1.5 text-gemini-subtext hover:text-amber-400 hover:bg-gemini-surface rounded-lg transition-colors"
            title="Favorite"
          >
            <Star class="h-4 w-4" />
          </button>

          <!-- Overflow Menu Button (...) -->
          <div class="relative">
            <button
              @click="toggleMenu(file.id, $event)"
              class="p-1.5 text-gemini-subtext hover:text-gemini-text hover:bg-gemini-surface rounded-lg transition-colors"
              title="More Actions"
            >
              <MoreVertical class="h-4 w-4" />
            </button>

            <!-- Categorized Overflow Dropdown Menu -->
            <div
              v-if="activeMenuId === file.id"
              @click.stop
              class="absolute right-0 mt-2 w-56 bg-gemini-card border border-gemini-border rounded-2xl shadow-xl z-50 py-1.5 text-xs text-gemini-text divide-y divide-gemini-border/50 animate-in fade-in zoom-in-95 duration-100"
            >
              <!-- Group 1: Viewing & Access -->
              <div class="py-1">
                <button @click="handleAction('view', file)" class="w-full flex items-center gap-2.5 px-3.5 py-2 hover:bg-gemini-surface transition-colors">
                  <Eye class="h-4 w-4 text-gemini-blue" />
                  <span>View File</span>
                </button>
                <button @click="handleAction('download', file)" class="w-full flex items-center gap-2.5 px-3.5 py-2 hover:bg-gemini-surface transition-colors">
                  <Download class="h-4 w-4 text-gemini-subtext" />
                  <span>Download</span>
                </button>
              </div>

              <!-- Group 2: Virtual Groupings & Collections -->
              <div class="py-1">
                <button @click="handleAction('add_collection', file)" class="w-full flex items-center gap-2.5 px-3.5 py-2 hover:bg-gemini-surface transition-colors">
                  <PlusCircle class="h-4 w-4 text-gemini-subtext" />
                  <span>Add to Collection...</span>
                </button>
                <button @click="handleAction('favorite', file)" class="w-full flex items-center gap-2.5 px-3.5 py-2 hover:bg-gemini-surface transition-colors">
                  <Star class="h-4 w-4 text-amber-400" />
                  <span>Add to Favorites</span>
                </button>
              </div>

              <!-- Group 3: File System Management -->
              <div class="py-1">
                <button @click="handleAction('rename', file)" class="w-full flex items-center gap-2.5 px-3.5 py-2 hover:bg-gemini-surface transition-colors">
                  <Edit3 class="h-4 w-4 text-gemini-subtext" />
                  <span>Rename...</span>
                </button>
                <button @click="handleAction('move', file)" class="w-full flex items-center gap-2.5 px-3.5 py-2 hover:bg-gemini-surface transition-colors">
                  <FolderInput class="h-4 w-4 text-gemini-subtext" />
                  <span>Move to Folder...</span>
                </button>
              </div>

              <!-- Group 4: Inspection & System -->
              <div class="py-1">
                <button @click="handleAction('show_in_folder', file)" class="w-full flex items-center gap-2.5 px-3.5 py-2 hover:bg-gemini-surface transition-colors">
                  <FolderSearch class="h-4 w-4 text-gemini-subtext" />
                  <span>Show in Host Folder</span>
                </button>
                <button @click="handleAction('properties', file)" class="w-full flex items-center gap-2.5 px-3.5 py-2 hover:bg-gemini-surface transition-colors">
                  <Info class="h-4 w-4 text-gemini-subtext" />
                  <span>Properties & Metadata</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

Why This UI Pattern Scales
• Zero UI Noise: The rows stay completely clean; buttons only reveal themselves when hovering over an item.
• Extensible Architecture: New tools (like AI tag generators or batch renamers) can be added as new items inside the appropriate dropdown group without breaking the row layout.
• Accessibility & Speed: Users who want fast access hit the inline hover icons (Eye / Star); users who want advanced options hit the ... menu.