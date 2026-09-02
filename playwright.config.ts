import { defineConfig, devices } from '@playwright/test'
import { createHash } from 'node:crypto'

const workspacePort = 4100 + Number.parseInt(createHash('sha256').update(process.cwd()).digest('hex').slice(0, 4), 16) % 1000
const port = Number(process.env.PLAYWRIGHT_PORT ?? workspacePort)
const baseURL = `http://127.0.0.1:${port}`
const previewBuild = process.env.PLAYWRIGHT_PREVIEW === '1'

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: 'line',
  workers: 2,
  use: {
    baseURL,
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'vital-performance',
      testMatch: /vital-performance\.spec\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'chromium',
      testIgnore: /vital-performance\.spec\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: `npm run ${previewBuild ? 'preview' : 'dev'} -- --port ${port} --strictPort`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
  },
})
