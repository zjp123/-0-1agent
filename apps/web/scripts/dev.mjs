import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { dirname } from "node:path";

const DEFAULT_LOCAL_API_BASE_URL = "http://127.0.0.1:3000/api";
const E2E_MOCK_API_BASE_URL = "http://127.0.0.1:3999/api";

const require = createRequire(import.meta.url);
const nextCli = require.resolve("next/dist/bin/next");
const env = { ...process.env };

if (!env.NEXT_PUBLIC_API_BASE_URL || env.NEXT_PUBLIC_API_BASE_URL === E2E_MOCK_API_BASE_URL) {
  env.NEXT_PUBLIC_API_BASE_URL = DEFAULT_LOCAL_API_BASE_URL;
}

if (!env.NEXT_PUBLIC_WEB_ENV) {
  env.NEXT_PUBLIC_WEB_ENV = "local";
}

if (!env.NEXT_TEST_WASM_DIR) {
  try {
    env.NEXT_TEST_WASM_DIR = dirname(
      require.resolve("@next/swc-wasm-nodejs/package.json"),
    );
  } catch {
    // Next can still use the native SWC binary when the local platform allows it.
  }
}

const child = spawn(process.execPath, [nextCli, "dev", "--webpack", "-p", "3001"], {
  stdio: "inherit",
  env,
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 1);
});
