import type { RuntimeConfig } from "./types.js";

const ENVIRONMENTS = new Set(["development", "staging", "production"]);

function readString(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`Invalid runtime config field: ${key}`);
  }
  return value;
}

export function parseRuntimeConfig(
  input: unknown,
  allowedApiOrigins: ReadonlySet<string>,
): RuntimeConfig {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    throw new Error("Runtime config must be an object");
  }

  const record = input as Record<string, unknown>;
  const apiBaseUrl = new URL(readString(record, "apiBaseUrl"), window.location.origin);
  const release = readString(record, "release");
  const environment = readString(record, "environment");

  if (!allowedApiOrigins.has(apiBaseUrl.origin)) {
    throw new Error(`API origin is not allowed: ${apiBaseUrl.origin}`);
  }
  if (!ENVIRONMENTS.has(environment)) {
    throw new Error(`Unsupported environment: ${environment}`);
  }

  return Object.freeze({
    apiBaseUrl,
    release,
    environment: environment as RuntimeConfig["environment"],
  });
}
