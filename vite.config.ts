import { defineConfig, type UserConfig, type ViteDevServer } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath } from 'node:url'

function redirectPasswordPage(server: Pick<ViteDevServer, 'middlewares'>) {
    server.middlewares.use((request, response, next) => {
        const url = request.url
        if (!url || url.split('?')[0] !== '/passwords') {
            next()
            return
        }
        response.statusCode = 307
        response.setHeader('Location', `/passwords/${url.slice('/passwords'.length)}`)
        response.end()
    })
}

export default defineConfig(({ mode }): UserConfig => ({
    plugins: [
        {
            name: 'password-page-redirect',
            configureServer: redirectPasswordPage,
            configurePreviewServer: redirectPasswordPage,
        },
        vue(),
        tailwindcss(),
    ],

    resolve: {
        alias: {
            '@': fileURLToPath(new URL('./src', import.meta.url))
        }
    },

    build: {
        emptyOutDir: mode !== 'passwords',
        rolldownOptions: {
            input: mode === 'passwords'
                ? { passwords: fileURLToPath(new URL('./passwords/index.html', import.meta.url)) }
                : {
                    app: fileURLToPath(new URL('./index.html', import.meta.url)),
                    passwords: fileURLToPath(new URL('./passwords/index.html', import.meta.url)),
                },
        },
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
}))