import { fileURLToPath } from 'node:url'
import { mergeConfig, defineConfig, configDefaults } from 'vitest/config'
import viteConfig from './vite.config'

export default defineConfig((configEnv) =>
  mergeConfig(
    viteConfig(configEnv),
    defineConfig({
      test: {
        environment: 'jsdom',
        exclude: [...configDefaults.exclude, 'e2e/**'],
        setupFiles: [fileURLToPath(new URL('./vitest.setup.ts', import.meta.url))],
        root: fileURLToPath(new URL('./', import.meta.url)),
      },
    }),
  )
)
