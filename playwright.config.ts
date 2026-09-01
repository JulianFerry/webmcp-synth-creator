import { defineConfig, devices } from '@playwright/test'
import { createHash } from 'node:crypto'

const workspacePort = 4100 + Number.parseInt(createHash('sha256').update(process.cwd()).digest('hex').slice(0, 4), 16) % 1000
const baseURL = `http://127.0.0.1:${workspacePort}`

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
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'npm run dev -- --strictPort --port $PORT',
    url: baseURL,
    env: { ...process.env, PORT: String(workspacePort) },
    reuseExistingServer: !process.env.CI,
  },
})
