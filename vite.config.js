import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// The site is published from the gh-pages branch at
// https://Ralileo16.github.io/tcresearch/, so production builds must use
// the /tcresearch/ base path. Dev keeps the root base for a clean URL.
export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/tcresearch/' : '/',
  plugins: [react(), tailwindcss()],
}))