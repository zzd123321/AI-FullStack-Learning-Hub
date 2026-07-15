export type CsrfDecision =
  | { readonly allowed: true }
  | { readonly allowed: false; readonly reason: string };

export interface CsrfContext {
  readonly method: string;
  readonly headers: Headers;
  readonly sessionToken: string;
  readonly allowedOrigins: ReadonlySet<string>;
}

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export function validateCsrfBoundary(context: CsrfContext): CsrfDecision {
  if (SAFE_METHODS.has(context.method.toUpperCase())) return { allowed: true };

  const fetchSite = context.headers.get("sec-fetch-site");
  if (fetchSite === "cross-site") {
    return { allowed: false, reason: "Cross-site request blocked by Fetch Metadata" };
  }

  const origin = context.headers.get("origin");
  if (!origin || !context.allowedOrigins.has(origin)) {
    return { allowed: false, reason: "Origin is missing or not allowed" };
  }

  const requestToken = context.headers.get("x-csrf-token");
  if (!requestToken || requestToken !== context.sessionToken) {
    return { allowed: false, reason: "CSRF token mismatch" };
  }

  return { allowed: true };
}
