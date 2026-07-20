function normalizeWeakEtag(value: string): string {
  return value.trim().replace(/^W\//, "");
}

function parseEntityTags(value: string): string[] | null {
  const tags: string[] = [];
  let index = 0;

  while (index < value.length) {
    while (value[index] === " " || value[index] === "\t") index += 1;
    const start = index;
    if (value.slice(index, index + 2) === "W/") index += 2;
    if (value[index] !== '"') return null;
    index += 1;

    while (index < value.length && value[index] !== '"') {
      const code = value.charCodeAt(index);
      // RFC 9110 etagc：可见 ASCII（双引号除外）或 obs-text。
      if (code < 0x21 || code === 0x22) return null;
      index += 1;
    }
    if (value[index] !== '"') return null;
    index += 1;
    tags.push(value.slice(start, index));

    while (value[index] === " " || value[index] === "\t") index += 1;
    if (index === value.length) return tags;
    if (value[index] !== ",") return null;
    index += 1;
    if (index === value.length) return null;
  }
  return tags;
}

export function ifNoneMatchMatches(headerValue: string | null, currentEtag: string): boolean {
  if (!headerValue) return false;
  if (headerValue.trim() === "*") return true;
  const normalizedCurrent = normalizeWeakEtag(currentEtag);
  // opaque-tag 允许包含逗号，所以不能直接 headerValue.split(",")。
  // 解析完整列表；语法无效时按“不匹配”处理，而不是宽松截取其中一段。
  const entityTags = parseEntityTags(headerValue);
  if (!entityTags) return false;
  return entityTags.some((candidate) => normalizeWeakEtag(candidate) === normalizedCurrent);
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
