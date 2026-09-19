import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    port: 5173,
    open: true,
    // 模型是手動拖進來的，檔案還在寫入時 Windows 會鎖住它，
    // chokidar 去監看就會噴 EBUSY 並讓整個 dev server 崩潰。
    // 這個資料夾不需要熱更新（換模型手動重新整理即可），直接排除。
    watch: { ignored: ['**/public/models/**', '**/incoming/**'] },
  },
  build: { target: 'es2022', chunkSizeWarningLimit: 2000 },
});
