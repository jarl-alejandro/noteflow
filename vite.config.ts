import { defineConfig } from 'vite'
import { devtools } from '@tanstack/devtools-vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import viteReact from '@vitejs/plugin-react'
import viteTsConfigPaths from 'vite-tsconfig-paths'
import tailwindcss from '@tailwindcss/vite'
import netlify from '@netlify/vite-plugin-tanstack-start'

const config = defineConfig({
  plugins: [
    devtools(),
    netlify(),
    // this is the plugin that enables path aliases
    viteTsConfigPaths({
      projects: ['./tsconfig.json'],
    }),
    tailwindcss(),
    tanstackStart(),
    viteReact({
      babel: {
        plugins: ['babel-plugin-react-compiler'],
      },
    }),
  ],
  optimizeDeps: {
    force: true, // Forzar reoptimización de dependencias
    exclude: ['pg', 'pg-native', 'drizzle-orm', 'dotenv'], // Excluir módulos del servidor
  },
  ssr: {
    noExternal: ['@tanstack/react-start'], // Asegurar que TanStack Start se procese correctamente
    external: ['pg', 'pg-native', 'drizzle-orm'], // Marcar como externos en SSR
  },
  resolve: {
    alias: {
      // Evitar que Vite resuelva estas dependencias en el cliente
      'pg': false,
      'pg-native': false,
      'drizzle-orm': false,
    },
  },
  build: {
    rollupOptions: {
      external: (id) => {
        // Excluir módulos de Node.js del bundle del cliente
        if (
          id.includes('pg') || 
          id.includes('drizzle-orm') || 
          id.includes('dotenv') ||
          id.includes('node:') ||
          id === 'util' ||
          id === 'crypto' ||
          id === 'buffer'
        ) {
          return true
        }
        return false
      },
    },
  },
  server: {
    fs: {
      // Permitir servir archivos desde node_modules
      allow: ['..'],
    },
  },
})

export default config
