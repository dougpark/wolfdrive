import { createRouter, createWebHistory } from 'vue-router'
import HomeView from '../views/HomeView.vue'
import SwatchesView from '../views/SwatchesView.vue'
import SettingsView from '../views/SettingsView.vue'

export const router = createRouter({
    history: createWebHistory(),
    routes: [
        { path: '/', component: HomeView },
        { path: '/swatches', component: SwatchesView },
        { path: '/settings', component: SettingsView },
    ],
})