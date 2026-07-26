import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

const page = (path: string) => fileURLToPath(new URL(path, import.meta.url))

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      // Multi-page build. `/` is the React editor; every other entry is hand-written
      // static HTML that ships its own content and never loads the app bundle, so
      // crawlers (and the LLM crawlers that don't run JS at all) see real prose.
      input: {
        main: page('./index.html'),
        about: page('./about/index.html'),
        guides: page('./guides/index.html'),
        guideAlkanes: page('./guides/how-to-name-alkanes/index.html'),
        guideAlkenes: page('./guides/how-to-name-alkenes-and-alkynes/index.html'),
        guideBranched: page('./guides/naming-branched-chains/index.html'),
        guidePriority: page('./guides/functional-group-priority/index.html'),
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
