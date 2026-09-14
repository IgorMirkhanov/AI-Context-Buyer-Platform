/**
 * One-shot probe: does Google Ads developer token work on a non-test customer?
 * Prints only status — never tokens/secrets.
 *
 * Usage: node scripts/check-google-ads-access.mjs
 */
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { createDecipheriv, scryptSync } from "crypto";
import pg from "pg";

const { Client } = pg;
const __dirname = dirname(fileURLToPath(import.meta.url));

function loadEnv(path) {
  const out = {};
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    if (!line || line.startsWith("#")) continue;
    const i = line.indexOf("=");
    if (i < 0) continue;
    const key = line.slice(0, i).trim();
    let val = line.slice(i + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    out[key] = val;
  }
  return out;
}

function parseKey(raw) {
  const value = (raw ?? "").trim();
  if (!value) throw new Error("TOKEN_ENCRYPTION_KEY missing");
  if (/^[0-9a-fA-F]{64}$/.test(value)) return Buffer.from(value, "hex");
  const fromBase64 = Buffer.from(value, "base64");
  if (fromBase64.length === 32) return fromBase64;
  if (value.length >= 32) return scryptSync(value, "context-buyer-token-key", 32);
  throw new Error("TOKEN_ENCRYPTION_KEY invalid");
}

function decryptSecret(payload, key) {
  const [ivPart, tagPart, dataPart] = payload.split(".");
  if (!ivPart || !tagPart || !dataPart) throw new Error("bad ciphertext");
  const decipher = createDecipheriv(
    "aes-256-gcm",
    key,
    Buffer.from(ivPart, "base64url"),
  );
  decipher.setAuthTag(Buffer.from(tagPart, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(dataPart, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

function classifyError(message) {
  const lower = (message || "").toLowerCase();
  if (
    lower.includes("developer token") ||
    lower.includes("only allowed to access test") ||
    lower.includes("test account")
  ) {
    return "EXPLORER_OR_TEST_ONLY";
  }
  if (
    lower.includes("permission") ||
    lower.includes("authorization") ||
    lower.includes("unauth")
  ) {
    return "AUTH_OR_PERMISSION";
  }
  return "OTHER_ERROR";
}

async function googleRequest({
  accessToken,
  developerToken,
  loginCustomerId,
  path,
  body,
}) {
  const headers = {
    Authorization: `Bearer ${accessToken}`,
    "developer-token": developerToken,
    "Content-Type": "application/json",
  };
  if (loginCustomerId && loginCustomerId.replace(/\D/g, "")) {
    headers["login-customer-id"] = loginCustomerId.replace(/\D/g, "");
  }
  const res = await fetch(`https://googleads.googleapis.com/v25/${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body ?? {}),
  });
  const json = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, json };
}

async function main() {
  const root = join(__dirname, "..");
  const env = loadEnv(join(root, ".env"));

  console.log("config:");
  console.log(`  GOOGLE_ADS_MOCK=${env.GOOGLE_ADS_MOCK ?? "(unset)"}`);
  console.log(`  CLIENT_ID=${env.GOOGLE_ADS_CLIENT_ID ? "set" : "missing"}`);
  console.log(
    `  DEVELOPER_TOKEN=${env.GOOGLE_ADS_DEVELOPER_TOKEN ? "set" : "missing"}`,
  );
  console.log(
    `  LOGIN_CUSTOMER_ID=${env.GOOGLE_ADS_LOGIN_CUSTOMER_ID ? "set" : "empty"}`,
  );

  if (!env.DATABASE_URL) throw new Error("DATABASE_URL missing");
  if (!env.GOOGLE_ADS_DEVELOPER_TOKEN) {
    throw new Error("GOOGLE_ADS_DEVELOPER_TOKEN missing");
  }

  const key = parseKey(env.TOKEN_ENCRYPTION_KEY);
  const db = new Client({ connectionString: env.DATABASE_URL });
  await db.connect();

  const { rows } = await db.query(
    `SELECT project_id, external_account_id, access_token_encrypted, expires_at
     FROM ad_platform_credentials
     WHERE platform = 'google_ads'
     ORDER BY created_at DESC
     LIMIT 5`,
  );
  await db.end();

  if (rows.length === 0) {
    console.log("result: NO_GOOGLE_CREDENTIAL_IN_DB");
    console.log(
      "hint: подключите Google Ads к проекту в UI (OAuth), затем повторите.",
    );
    process.exit(2);
  }

  console.log(`credentials_in_db: ${rows.length}`);
  const row = rows[0];
  const customerId = String(row.external_account_id || "").replace(/\D/g, "");
  console.log(
    `using: customerId=${customerId || "(none)"} expires_at=${row.expires_at || "(n/a)"}`,
  );

  const accessToken = decryptSecret(row.access_token_encrypted, key);

  const list = await fetch(
    "https://googleads.googleapis.com/v25/customers:listAccessibleCustomers",
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "developer-token": env.GOOGLE_ADS_DEVELOPER_TOKEN,
      },
    },
  );
  const listJson = await list.json().catch(() => ({}));
  if (!list.ok) {
    const msg = listJson.error?.message || `HTTP ${list.status}`;
    console.log(`listAccessibleCustomers: FAIL (${classifyError(msg)})`);
    console.log(`  message: ${msg}`);
    process.exit(1);
  }
  const resourceNames = listJson.resourceNames || [];
  console.log(
    `listAccessibleCustomers: OK (${resourceNames.length} customers)`,
  );

  const targetCustomer =
    customerId ||
    String(resourceNames[0] || "")
      .replace("customers/", "")
      .replace(/\D/g, "");
  if (!targetCustomer) {
    console.log("result: NO_CUSTOMER_ID");
    process.exit(2);
  }

  const probe = await googleRequest({
    accessToken,
    developerToken: env.GOOGLE_ADS_DEVELOPER_TOKEN,
    loginCustomerId: env.GOOGLE_ADS_LOGIN_CUSTOMER_ID,
    path: `customers/${targetCustomer}/googleAds:search`,
    body: { query: "SELECT customer.id FROM customer LIMIT 1" },
  });

  if (!probe.ok) {
    const msg = probe.json.error?.message || `HTTP ${probe.status}`;
    const kind = classifyError(msg);
    console.log(`probe customer ${targetCustomer}: FAIL (${kind})`);
    console.log(`  message: ${msg}`);
    if (kind === "EXPLORER_OR_TEST_ONLY") {
      console.log(
        "verdict: developer token still Explorer / test-accounts only",
      );
    } else {
      console.log(
        "verdict: token may be Basic, but this customer/call failed",
      );
    }
    process.exit(1);
  }
  console.log(`probe customer ${targetCustomer}: OK`);

  const ideas = await googleRequest({
    accessToken,
    developerToken: env.GOOGLE_ADS_DEVELOPER_TOKEN,
    loginCustomerId: env.GOOGLE_ADS_LOGIN_CUSTOMER_ID,
    path: `customers/${targetCustomer}:generateKeywordIdeas`,
    body: {
      language: "languageConstants/1031",
      geoTargetConstants: ["geoTargetConstants/2643"],
      includeAdultKeywords: false,
      keywordPlanNetwork: "GOOGLE_SEARCH",
      keywordSeed: { keywords: ["купить ноутбук"] },
    },
  });

  if (!ideas.ok) {
    const msg = ideas.json.error?.message || `HTTP ${ideas.status}`;
    const kind = classifyError(msg);
    console.log(`generateKeywordIdeas: FAIL (${kind})`);
    console.log(`  message: ${msg}`);
    if (kind === "EXPLORER_OR_TEST_ONLY") {
      console.log(
        "verdict: NOT Basic for Keyword Planner yet (test-account only)",
      );
    } else {
      console.log(
        "verdict: customer probe OK, but Keyword Planner failed — check permissions/MCC",
      );
    }
    process.exit(1);
  }

  const count = (ideas.json.results || []).length;
  console.log(`generateKeywordIdeas: OK (${count} ideas)`);
  console.log("verdict: BASIC_ACCESS_OK — live Keyword Planner works");
}

main().catch((err) => {
  console.error("fatal:", err instanceof Error ? err.message : String(err));
  process.exit(1);
});
