import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { dirname } from "node:path";

const require = createRequire(import.meta.url);
const nextCli = require.resolve("next/dist/bin/next");
const env = { ...process.env };

if (!env.NEXT_TEST_WASM_DIR) {
  try {
    env.NEXT_TEST_WASM_DIR = dirname(
      require.resolve("@next/swc-wasm-nodejs/package.json"),
    );
  } catch {
    // Next can still use the native SWC binary when the local platform allows it.
  }
}

const child = spawn(process.execPath, [nextCli, "build", "--webpack"], {
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
