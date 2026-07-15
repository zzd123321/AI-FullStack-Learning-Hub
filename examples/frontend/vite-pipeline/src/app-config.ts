export interface ClientConfig {
  readonly apiBaseUrl: string;
  readonly enableLabs: boolean;
  readonly mode: string;
}

type ClientEnv = Readonly<Record<string, string | boolean | undefined>>;

function requiredString(env: ClientEnv, key: string): string {
  const value = env[key];
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`Missing client environment variable: ${key}`);
  }
  return value;
}

function parseBoolean(value: string | undefined, key: string): boolean {
  if (value === "true") return true;
  if (value === "false") return false;
  throw new Error(`${key} must be either "true" or "false"`);
}

export function parseClientConfig(env: ClientEnv, origin: string): ClientConfig {
  const apiBaseUrl = new URL(requiredString(env, "VITE_API_BASE_URL"), origin);
  if (apiBaseUrl.protocol !== "https:" && apiBaseUrl.origin !== origin) {
    throw new Error("Cross-origin API URLs must use HTTPS");
  }
  return {
    apiBaseUrl: apiBaseUrl.href,
    enableLabs: parseBoolean(requiredString(env, "VITE_ENABLE_LABS"), "VITE_ENABLE_LABS"),
    mode: requiredString(env, "MODE"),
  };
}
