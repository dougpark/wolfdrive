<script setup lang="ts">
import { onMounted } from 'vue'
import { useTheme } from './composables/useTheme'
import AppLayout from '@/components/layout/AppLayout.vue'

const { initTheme } = useTheme()

// Library browse views keep their search/filter/scroll state when navigating
// away (e.g. to the music player) and back, instead of remounting from scratch.
const KEEP_ALIVE_VIEWS = [
  'FilesView',
  'PhotosView',
  'VideosView',
  'BooksView',
  'DocumentsView',
  'MusicView',
  'MoviesView',
  'TvShowsView',
  'GamesView',
  'SoftwareView',
]

onMounted(() => {
  initTheme()
})
</script>
<template>
  <AppLayout>
    <router-view v-slot="{ Component }">
      <keep-alive :include="KEEP_ALIVE_VIEWS">
        <component :is="Component" />
      </keep-alive>
    </router-view>
  </AppLayout>
</template>