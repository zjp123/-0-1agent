import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.WEB_E2E_BASE_URL ?? "http://127.0.0.1:3101";

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  expect: {
    timeout: 5_000,
  },
  fullyParallel: true,
  reporter: [["list"]],
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  webServer: {
    command: "npx next dev --webpack -p 3101 --hostname 127.0.0.1",
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      NEXT_PUBLIC_API_BASE_URL: "http://127.0.0.1:3999/api",
      NEXT_TEST_WASM_DIR:
        process.env.NEXT_TEST_WASM_DIR ??
        "/Users/bjsttlp406/others/-0-1agent/node_modules/@next/swc-wasm-nodejs",
    },
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
