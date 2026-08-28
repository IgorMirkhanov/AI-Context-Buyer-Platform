const { execFileSync, spawn } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const { Client } = require("pg");
const { ROOT } = require("./load-env.cjs");

function withoutPrismaParams(raw) {
  const url = new URL(raw);
  url.searchParams.delete("schema");
  return url;
}

function withPort(raw, port) {
  const url = withoutPrismaParams(raw);
  url.port = String(port);
  return url.toString();
}

function adminUrl(raw) {
  const url = withoutPrismaParams(raw);
  url.pathname = "/postgres";
  return url.toString();
}

function dbName(raw) {
  return decodeURIComponent(
    withoutPrismaParams(raw).pathname.replace(/^\//, "").split("/")[0] ||
      "context_buyer_e2e",
  );
}

function withSchema(raw) {
  return raw.includes("schema=")
    ? raw
    : `${raw}${raw.includes("?") ? "&" : "?"}schema=public`;
}

async function canConnect(connectionString) {
  const client = new Client({
    connectionString: withoutPrismaParams(connectionString).toString(),
    connectionTimeoutMillis: 2500,
  });
  try {
    await client.connect();
    await client.query("SELECT 1");
    return true;
  } catch {
    return false;
  } finally {
    await client.end().catch(() => undefined);
  }
}

async function waitForUrl(url, attempts = 30) {
  for (let i = 0; i < attempts; i += 1) {
    if (await canConnect(url)) return true;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  return false;
}

function dockerInfoOk() {
  try {
    execFileSync("docker", ["info"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function startDockerDesktop() {
  if (process.platform !== "win32") return;
  const exe = path.join(
    process.env.LOCALAPPDATA || "",
    "Programs",
    "DockerDesktop",
    "Docker Desktop.exe",
  );
  if (!fs.existsSync(exe)) return;
  spawn(exe, [], { detached: true, stdio: "ignore" }).unref();
}

async function ensureDockerDaemon() {
  if (dockerInfoOk()) return;
  startDockerDesktop();
  for (let i = 0; i < 40; i += 1) {
    if (dockerInfoOk()) return;
    await new Promise((resolve) => setTimeout(resolve, 3000));
  }
  throw new Error(
    "Docker is not running. Start Docker Desktop, then: docker compose --env-file .env -f infra/docker-compose.yml up -d postgres",
  );
}

function startComposePostgres() {
  const compose = path.join(ROOT, "infra", "docker-compose.yml");
  const envFile = path.join(ROOT, ".env");
  const args = ["compose", "-f", compose, "up", "-d", "postgres"];
  if (fs.existsSync(envFile)) {
    args.splice(1, 0, "--env-file", envFile);
  }
  execFileSync("docker", args, { cwd: ROOT, stdio: "inherit" });
}

async function ensureDatabase(appUrl) {
  const name = dbName(appUrl);
  const client = new Client({
    connectionString: adminUrl(appUrl),
    connectionTimeoutMillis: 5000,
  });
  await client.connect();
  try {
    const found = await client.query(
      "SELECT 1 FROM pg_database WHERE datname = $1",
      [name],
    );
    if (found.rowCount === 0) {
      await client.query(`CREATE DATABASE "${name.replace(/"/g, '""')}"`);
    }
  } finally {
    await client.end();
  }
}

function migrate(databaseUrl) {
  execFileSync(
    process.platform === "win32" ? "npx.cmd" : "npx",
    ["prisma", "migrate", "deploy", "--schema", "apps/api/prisma/schema.prisma"],
    {
      cwd: ROOT,
      stdio: "inherit",
      env: { ...process.env, DATABASE_URL: databaseUrl },
      shell: process.platform === "win32",
    },
  );
}

async function ensureE2eDatabase() {
  const configured =
    process.env.DATABASE_URL ||
    "postgresql://context:context@127.0.0.1:5433/context_buyer_e2e?schema=public";

  const candidates = [configured];
  const configuredPort = withoutPrismaParams(configured).port || "5432";
  if (configuredPort === "5433") candidates.push(withPort(configured, 5432));
  else if (configuredPort === "5432") candidates.push(withPort(configured, 5433));

  let working = null;
  for (const url of candidates) {
    if ((await canConnect(adminUrl(url))) || (await canConnect(url))) {
      working = url;
      break;
    }
  }

  if (!working) {
    await ensureDockerDaemon();
    startComposePostgres();
    for (const url of candidates) {
      if ((await waitForUrl(adminUrl(url))) || (await waitForUrl(url))) {
        working = url;
        break;
      }
    }
  }

  if (!working) {
    throw new Error(
      "E2E Postgres is not reachable on 5433 or 5432. Start Docker Desktop and retry.",
    );
  }

  const databaseUrl = withSchema(working);
  process.env.DATABASE_URL = databaseUrl;
  fs.writeFileSync(
    path.join(ROOT, "e2e", ".generated-env"),
    `DATABASE_URL=${databaseUrl}\n`,
    "utf8",
  );
  await ensureDatabase(working);
  migrate(databaseUrl);
  return databaseUrl;
}

module.exports = { ensureE2eDatabase };
