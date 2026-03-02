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
  server: {
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