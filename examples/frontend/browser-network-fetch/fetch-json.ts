import { createRequestSignal } from "./request-signal.js";

export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly requestUrl: string,
    readonly problem: unknown,
  ) {
    super(`HTTP ${status} for ${requestUrl}`);
    this.name = "HttpError";
  }
}

function isJsonContentType(value: string | null): boolean {
  if (!value) return false;
  const mediaType = value.split(";", 1)[0]?.trim().toLowerCase() ?? "";
  return mediaType === "application/json" || mediaType.endsWith("+json");
}

async function readJson(response: Response): Promise<unknown> {
  if (!isJsonContentType(response.headers.get("content-type"))) {
    throw new TypeError(`Expected JSON but received ${response.headers.get("content-type") ?? "unknown"}`);
  }
  return response.json() as Promise<unknown>;
}

export async function fetchJson<T>(
  input: RequestInfo | URL,
  parse: (value: unknown) => T,
  init: RequestInit & { readonly timeoutMs?: number } = {},
): Promise<T> {
  const { timeoutMs = 10_000, signal: parentSignal, ...requestInit } = init;
  const managed = createRequestSignal(parentSignal ?? undefined, timeoutMs);

  try {
    const response = await fetch(input, { ...requestInit, signal: managed.signal });
    if (!response.ok) {
      let problem: unknown = null;
      if (isJsonContentType(response.headers.get("content-type"))) {
        problem = await response.json().catch(() => null) as unknown;
      }
      throw new HttpError(response.status, response.url, problem);
    }
    return parse(await readJson(response));
  } finally {
    managed.dispose();
  }
}
