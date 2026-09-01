import { createRouter, createWebHistory } from 'vue-router'
import HomeView from '../views/HomeView.vue'
import SwatchesView from '../views/SwatchesView.vue'
import SettingsView from '../views/SettingsView.vue'
import AboutView from '../views/AboutView.vue'
import LibraryView from '../views/LibraryView.vue'

export const router = createRouter({
    history: createWebHistory(),
    routes: [
        { path: '/', redirect: '/files' },
        { path: '/files', component: HomeView },
        { path: '/photos', component: LibraryView, props: { title: 'Photos', description: 'Your image library.' } },
        { path: '/videos', component: LibraryView, props: { title: 'Videos', description: 'Your video library.' } },
        { path: '/books', component: LibraryView, props: { title: 'Books', description: 'Your reading library.' } },
        { path: '/documents', component: LibraryView, props: { title: 'Documents', description: 'Your document library.' } },
        { path: '/music', component: LibraryView, props: { title: 'Music', description: 'Your music library.' } },
        { path: '/movies', component: LibraryView, props: { title: 'Movies', description: 'Your movie library.' } },
        { path: '/tv-shows', component: LibraryView, props: { title: 'TV Shows', description: 'Your television library.' } },
        { path: '/games', component: LibraryView, props: { title: 'Games', description: 'Your game library.' } },
        { path: '/software', component: LibraryView, props: { title: 'Software', description: 'Your software library.' } },
        { path: '/swatches', component: SwatchesView },
        { path: '/settings', component: SettingsView },
        { path: '/about', component: AboutView },
    ],
})