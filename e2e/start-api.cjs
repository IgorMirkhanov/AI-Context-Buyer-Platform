const { spawn } = require("node:child_process");
const { applyE2eEnv, ROOT } = require("./load-env.cjs");
const { ensureE2eDatabase } = require("./ensure-db.cjs");

applyE2eEnv();

ensureE2eDatabase()
  .then(() => {
    const child = spawn(process.execPath, ["apps/api/dist/main.js"], {
      cwd: ROOT,
      stdio: "inherit",
      env: process.env,
    });
    child.on("exit", (code, signal) => {
      if (signal) process.kill(process.pid, signal);
      process.exit(code ?? 1);
    });
  })
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
