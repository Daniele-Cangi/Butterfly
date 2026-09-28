import { defineConfig } from "@playwright/test";
export default defineConfig({ testDir: "./tests/browser", use: { baseURL: "http://127.0.0.1:3000", screenshot: "only-on-failure" }, webServer: { command: "npm run dev -- --hostname 127.0.0.1", url: "http://127.0.0.1:3000", reuseExistingServer: true, timeout: 120000 } });
