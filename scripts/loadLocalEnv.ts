import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { loadEnvConfig } = require("@next/env") as typeof import("@next/env");

export function loadLocalEnv() {
  loadEnvConfig(process.cwd());
}
