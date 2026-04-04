import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // 必須與 GitHub 儲存庫名稱完全一致，首尾皆強制需要斜線 (Slash)
  base: '/PikminTimer/',
})