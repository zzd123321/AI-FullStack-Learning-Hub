export type ResourceKind =
  | "hashed-asset"
  | "document"
  | "public-api"
  | "personalized-api"
  | "sensitive";

export function cacheHeadersFor(kind: ResourceKind): Readonly<Record<string, string>> {
  switch (kind) {
    case "hashed-asset":
      return { "Cache-Control": "public, max-age=31536000, immutable" };
    case "document":
      return { "Cache-Control": "no-cache", Vary: "Accept-Encoding" };
    case "public-api":
      return {
        "Cache-Control": "public, max-age=60, stale-while-revalidate=300",
        Vary: "Accept-Encoding, Accept-Language",
      };
    case "personalized-api":
      return { "Cache-Control": "private, no-cache", Vary: "Accept-Encoding" };
    case "sensitive":
      return { "Cache-Control": "no-store" };
  }
}
