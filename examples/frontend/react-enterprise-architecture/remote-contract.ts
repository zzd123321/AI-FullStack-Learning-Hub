export interface RemoteManifestV1 {
  readonly schemaVersion: 1;
  readonly name: string;
  readonly entryUrl: URL;
  readonly exposedModule: string;
  readonly hostApiMajor: number;
}

export function parseRemoteManifest(
  input: unknown,
  allowedOrigins: ReadonlySet<string>,
  supportedHostApiMajor: number,
): RemoteManifestV1 {
  if (typeof input !== "object" || input === null) throw new Error("Invalid remote manifest");
  const record = input as Record<string, unknown>;
  if (
    record.schemaVersion !== 1 ||
    typeof record.name !== "string" ||
    typeof record.entryUrl !== "string" ||
    typeof record.exposedModule !== "string" ||
    typeof record.hostApiMajor !== "number"
  ) {
    throw new Error("Remote manifest fields are invalid");
  }

  const entryUrl = new URL(record.entryUrl, window.location.origin);
  if (!allowedOrigins.has(entryUrl.origin)) throw new Error("Remote origin is not allowed");
  if (record.hostApiMajor !== supportedHostApiMajor) {
    throw new Error(`Incompatible host API major: ${record.hostApiMajor}`);
  }

  return {
    schemaVersion: 1,
    name: record.name,
    entryUrl,
    exposedModule: record.exposedModule,
    hostApiMajor: record.hostApiMajor,
  };
}
