const ALLOWED_METHODS = "GET, POST, PUT, DELETE";
const ALLOWED_HEADERS = "content-type, x-csrf-token";

export function createCorsHeaders(
  requestOrigin: string | null,
  allowedOrigins: ReadonlySet<string>,
): Headers {
  const headers = new Headers({
    vary: "Origin",
    "access-control-allow-methods": ALLOWED_METHODS,
    "access-control-allow-headers": ALLOWED_HEADERS,
    "access-control-max-age": "600",
  });

  if (requestOrigin && allowedOrigins.has(requestOrigin)) {
    headers.set("access-control-allow-origin", requestOrigin);
    headers.set("access-control-allow-credentials", "true");
  }
  return headers;
}
