import path from "path"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    // Las páginas se cargan con React.lazy; las librerías grandes van en chunks
    // propios para que el navegador las cachee entre despliegues.
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return;
          if (id.includes('/firebase/') || id.includes('/@firebase/')) return 'firebase';
          if (id.includes('/react-dom/') || id.includes('/react/') || id.includes('/react-router') || id.includes('/scheduler/')) return 'react';
        },
      },
    },
  },
  server: {
    watch: {
      usePolling: true,
      interval: 300,
    },
    proxy: {
      '/nelyoda/us-central1': {
        target: 'https://us-central1-nelyoda.cloudfunctions.net',
        changeOrigin: true,
        rewrite: (path) => path.replace('/nelyoda/us-central1', ''),
        secure: true,
      },
    },
  },
})
