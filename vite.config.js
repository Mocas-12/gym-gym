import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// base './' 相对路径：构建产物可以直接挂在任何子路径下（GitHub Pages 的 /gym-gym/）
export default defineConfig({
  base: './',
  plugins: [react()],
  build: { target: 'es2020' },
})
