const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");

function parseEnvFile(filePath) {
  const out = {};
  if (!fs.existsSync(filePath)) return out;
  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

function applyE2eEnv() {
  const file = parseEnvFile(path.join(ROOT, ".env.e2e"));
  for (const [key, value] of Object.entries(file)) {
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
  const generated = parseEnvFile(path.join(ROOT, "e2e", ".generated-env"));
  Object.assign(process.env, generated);
  return process.env;
}

function e2eChildEnv() {
  applyE2eEnv();
  const env = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined) env[key] = value;
  }
  return env;
}

module.exports = { ROOT, parseEnvFile, applyE2eEnv, e2eChildEnv };
