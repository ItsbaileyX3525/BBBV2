import { defineConfig } from 'vite'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig(
    {  
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
        }
    }
)