import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      // Multi-page build. `/` is the React editor; every other entry is hand-written
      // static HTML that ships its own content and never loads the app bundle, so
      // crawlers (and the LLM crawlers that don't run JS at all) see real prose.
      // Paths are relative to `root`, so adding a page means adding a line here
      // and a <url> in public/sitemap.xml.
      input: {
        main: 'index.html',
        about: 'about/index.html',
      },
    },
  },
  server: {
    // OrganicNamer.Api has no CORS setup; proxying in dev avoids needing any.
    proxy: {
      '/api': {
        target: 'http://localhost:5001',
        changeOrigin: true,
      },
    },
  },
  test: {
    environment: 'node',
  },
})
