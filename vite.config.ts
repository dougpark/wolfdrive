import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath } from 'node:url'


export default defineConfig({
    plugins: [
        vue(),
        tailwindcss(),
    ],

    resolve: {
        alias: {
            '@': fileURLToPath(new URL('./src', import.meta.url))
        }
    },

    server: {
        host: true, // Listens on all local IPs
        port: 5173,
        strictPort: true, // Prevents Vite from auto-incrementing to 5174/5175 when stuck
        allowedHosts: ['aistation.local'],
        hmr: {
            clientPort: 5173, // Forces browser to reuse the exact forwarded port
        },
        watch: {
            usePolling: true, // Prevents file watcher disconnects over SSH/remote mounts
            interval: 100,
        },
        proxy: {
            '/api': {
                target: 'http://127.0.0.1:3005',
                changeOrigin: true,
            },
        },
    },
})