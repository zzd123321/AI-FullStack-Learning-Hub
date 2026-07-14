export interface CorsPolicy {
  readonly allowedOrigins: ReadonlySet<string>;
  readonly allowedMethods: ReadonlySet<string>;
  readonly allowedHeaders: ReadonlySet<string>;
  readonly allowCredentials: boolean;
  readonly maxAgeSeconds: number;
}

export interface CorsDecision {
  readonly allowed: boolean;
  readonly headers: Headers;
}

export function evaluateCors(request: Request, policy: CorsPolicy): CorsDecision {
  const origin = request.headers.get("origin");
  const headers = new Headers({ Vary: "Origin" });
  if (!origin) return { allowed: true, headers };
  if (!policy.allowedOrigins.has(origin)) return { allowed: false, headers };

  headers.set("Access-Control-Allow-Origin", origin);
  if (policy.allowCredentials) headers.set("Access-Control-Allow-Credentials", "true");

  if (request.method === "OPTIONS") {
    const requestedMethod = request.headers.get("access-control-request-method")?.toUpperCase();
    if (!requestedMethod || !policy.allowedMethods.has(requestedMethod)) {
      return { allowed: false, headers };
    }

    const requestedHeaders = (request.headers.get("access-control-request-headers") ?? "")
      .split(",")
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean);
    if (!requestedHeaders.every((value) => policy.allowedHeaders.has(value))) {
      return { allowed: false, headers };
    }

    headers.set("Access-Control-Allow-Methods", [...policy.allowedMethods].join(", "));
    headers.set("Access-Control-Allow-Headers", requestedHeaders.join(", "));
    headers.set("Access-Control-Max-Age", String(policy.maxAgeSeconds));
  }
  return { allowed: true, headers };
}
