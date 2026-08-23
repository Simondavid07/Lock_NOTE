import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  envDir: '..',
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
  build: {
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: {
        manualChunks: {
          editor: [
            '@codemirror/state',
            '@codemirror/view',
            '@codemirror/language',
            '@codemirror/commands',
            '@codemirror/autocomplete',
            '@codemirror/lang-javascript',
            '@codemirror/lang-markdown',
            '@codemirror/lang-json',
            '@codemirror/lang-python',
            '@codemirror/lang-html',
            '@codemirror/lang-css',
            '@codemirror/lang-sql',
            '@codemirror/lang-yaml',
            '@codemirror/lang-cpp',
            '@lezer/common',
            '@lezer/lr',
            '@lezer/highlight',
            '@lezer/javascript',
            '@lezer/markdown',
            '@lezer/json',
            '@lezer/python',
            '@lezer/html',
            '@lezer/css',
            '@lezer/yaml',
            '@lezer/cpp',
          ],
          markdown: ['marked', 'dompurify'],
        },
      },
    },
  },
})