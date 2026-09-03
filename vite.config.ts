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
    // La aplicación integra Firebase, gráficos, Excel y generación de PDF en el
    // bundle principal. Conservamos una alerta útil si supera el tamaño actual
    // esperado, sin emitir el umbral genérico de 500 kB en cada compilación.
    chunkSizeWarningLimit: 3500,
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
