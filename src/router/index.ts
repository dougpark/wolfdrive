import { createRouter, createWebHistory } from 'vue-router'
import FilesView from '../views/FilesView.vue'
import PhotosView from '../views/PhotosView.vue'
import VideosView from '../views/VideosView.vue'
import BooksView from '../views/BooksView.vue'
import DocumentsView from '../views/DocumentsView.vue'
import MusicView from '../views/MusicView.vue'
import MoviesView from '../views/MoviesView.vue'
import TvShowsView from '../views/TvShowsView.vue'
import GamesView from '../views/GamesView.vue'
import SoftwareView from '../views/SoftwareView.vue'
import SwatchesView from '../views/SwatchesView.vue'
import SettingsView from '../views/SettingsView.vue'
import AboutView from '../views/AboutView.vue'

export const router = createRouter({
    history: createWebHistory(),
    routes: [
        { path: '/', redirect: '/files' },
        { path: '/files', component: FilesView },
        { path: '/photos', component: PhotosView },
        { path: '/videos', component: VideosView },
        { path: '/books', component: BooksView },
        { path: '/documents', component: DocumentsView },
        { path: '/music', component: MusicView },
        { path: '/movies', component: MoviesView },
        { path: '/tv-shows', component: TvShowsView },
        { path: '/games', component: GamesView },
        { path: '/software', component: SoftwareView },
        { path: '/swatches', component: SwatchesView },
        { path: '/settings', component: SettingsView },
        { path: '/about', component: AboutView },
    ],
})