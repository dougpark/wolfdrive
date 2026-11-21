<script setup lang="ts">
import { onMounted, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useTheme } from './composables/useTheme'
import AppLayout from '@/components/layout/AppLayout.vue'

const { initTheme } = useTheme()
const route = useRoute()

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
  'ResearchView',
]

function initRouteTheme() {
  initTheme(route.meta.theme === 'dark' ? 'dark' : undefined)
}

onMounted(initRouteTheme)
watch(() => route.meta.theme, initRouteTheme)
</script>
<template>
  <router-view v-if="route.meta.standalone" />
  <AppLayout v-else>
    <router-view v-slot="{ Component }">
      <keep-alive :include="KEEP_ALIVE_VIEWS">
        <component :is="Component" />
      </keep-alive>
    </router-view>
  </AppLayout>
</template>