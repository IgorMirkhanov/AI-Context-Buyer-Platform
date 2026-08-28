const { spawn } = require("node:child_process");
const { applyE2eEnv, ROOT } = require("./load-env.cjs");

applyE2eEnv();

const npmCmd = process.platform === "win32" ? "npm.cmd" : "npm";
const child = spawn(
  npmCmd,
  ["run", "dev", "-w", "web", "--", "--port", "3100", "--hostname", "127.0.0.1"],
  {
    cwd: ROOT,
    stdio: "inherit",
    env: process.env,
    shell: process.platform === "win32",
  },
);

child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 1);
});
