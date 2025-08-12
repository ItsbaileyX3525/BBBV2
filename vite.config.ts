import { defineConfig, loadEnv } from 'vite'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, process.cwd(), '')
    
    return {
        base: "/",
        plugins: 
        [tailwindcss(),  ],
        build: {
            sourcemap: true,
        rollupOptions: {
            input: {
                main: 'index.html',
                room: 'room.html',
                notfound: '404.html',
                },
            },
        },
        server: {
        },
        define: {
            __SERVER_IP__: JSON.stringify(env.SERVER_IP || 'localhost'),
            __SERVER_PORT__: JSON.stringify(env.SERVER_PORT || '3001'),
        }
    }
})