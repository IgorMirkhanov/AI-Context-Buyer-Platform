export const AI_PROVIDER_REQUIRED_MESSAGE =
  "Подключите ИИ-провайдера в Настройках";

export type AiProviderName = "anthropic" | "openai";

export type AiCredentialSource = "database" | "env";

export type AiCredentialStatus = "unverified" | "valid" | "invalid";

export type ResolvedAiKey = {
  provider: AiProviderName;
  apiKey: string;
  source: AiCredentialSource;
};

const ENV_KEY: Record<AiProviderName, string> = {
  anthropic: "ANTHROPIC_API_KEY",
  openai: "OPENAI_API_KEY",
};

export function envKeyName(provider: AiProviderName): string {
  return ENV_KEY[provider];
}

export function readEnvAiKey(
  provider: AiProviderName,
  env: NodeJS.Dict<string> = process.env,
): string | null {
  const raw = env[ENV_KEY[provider]]?.trim();
  return raw ? raw : null;
}

/**
 * DB key wins when present and not marked invalid. Env is fallback for
 * local/CI. Callers pass both — agents never read process.env themselves.
 */
export function resolveAiApiKey(options: {
  databaseKey?: string | null;
  databaseStatus?: AiCredentialStatus | null;
  envKey?: string | null;
}): { apiKey: string; source: AiCredentialSource } | null {
  const db = options.databaseKey?.trim();
  if (db && options.databaseStatus !== "invalid") {
    return { apiKey: db, source: "database" };
  }
  const env = options.envKey?.trim();
  if (env) {
    return { apiKey: env, source: "env" };
  }
  return null;
}

export function maskApiKey(apiKey: string): string {
  const trimmed = apiKey.trim();
  if (trimmed.length <= 4) return "••••";
  return `••••${trimmed.slice(-4)}`;
}

export function redactAiSecret(value: string): string {
  return value
    .replace(/sk-[A-Za-z0-9_-]+/g, "sk-***")
    .replace(/Bearer\s+\S+/gi, "Bearer ***");
}
