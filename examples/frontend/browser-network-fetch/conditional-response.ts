function normalizeWeakEtag(value: string): string {
  return value.trim().replace(/^W\//, "");
}

export function ifNoneMatchMatches(headerValue: string | null, currentEtag: string): boolean {
  if (!headerValue) return false;
  if (headerValue.trim() === "*") return true;
  const normalizedCurrent = normalizeWeakEtag(currentEtag);
  return headerValue.split(",").some((candidate) => normalizeWeakEtag(candidate) === normalizedCurrent);
}

export function createConditionalJsonResponse(
  request: Request,
  body: unknown,
  etag: string,
  cacheControl: string,
): Response {
  const headers = new Headers({
    "Cache-Control": cacheControl,
    "Content-Type": "application/json; charset=utf-8",
    ETag: etag,
    Vary: "Accept-Encoding",
  });

  if ((request.method === "GET" || request.method === "HEAD") &&
      ifNoneMatchMatches(request.headers.get("if-none-match"), etag)) {
    headers.delete("Content-Type");
    return new Response(null, { status: 304, headers });
  }

  return new Response(request.method === "HEAD" ? null : JSON.stringify(body), {
    status: 200,
    headers,
  });
}
