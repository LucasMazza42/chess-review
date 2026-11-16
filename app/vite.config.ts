import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Project Pages URL is https://lucasmazza42.github.io/chess-review/
export default defineConfig({
  base: '/chess-review/',
  plugins: [react()],
  server: { host: '127.0.0.1' },
  preview: { host: '127.0.0.1' },
})
