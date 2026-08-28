import { defineConfig } from "@playwright/test";
import { applyE2eEnv, e2eChildEnv, ROOT } from "./load-env.cjs";

applyE2eEnv();

const WEB = "http://127.0.0.1:3100";
const API = "http://127.0.0.1:3101";

export default defineConfig({
  testDir: ".",
  testMatch: "**/*.spec.ts",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 180_000,
  expect: { timeout: 20_000 },
  reporter: [["list"], ["html", { open: "never", outputFolder: "../playwright-report" }]],
  outputDir: "../test-results",
  use: {
    baseURL: WEB,
    headless: true,
    locale: "ru-RU",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    video: "off",
  },
  webServer: [
    {
      command: "node e2e/start-api.cjs",
      cwd: ROOT,
      url: `${API}/health`,
      reuseExistingServer: !process.env.CI,
      timeout: 180_000,
      stdout: "pipe",
      stderr: "pipe",
      env: e2eChildEnv(),
    },
    {
      command: "node e2e/start-web.cjs",
      cwd: ROOT,
      url: WEB,
      reuseExistingServer: !process.env.CI,
      timeout: 180_000,
      stdout: "pipe",
      stderr: "pipe",
      env: e2eChildEnv(),
    },
  ],
});
