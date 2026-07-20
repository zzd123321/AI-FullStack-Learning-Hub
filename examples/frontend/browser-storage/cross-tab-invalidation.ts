export interface InvalidationMessage {
  readonly version: 1;
  readonly type: "draft-changed";
  readonly draftId: string;
  readonly revision: number;
}

export function parseInvalidationMessage(value: unknown): InvalidationMessage | null {
  if (typeof value !== "object" || value === null) return null;
  const record = value as Record<string, unknown>;
  return record.version === 1 && record.type === "draft-changed" &&
    typeof record.draftId === "string" && /^[a-z0-9][a-z0-9-]{1,79}$/.test(record.draftId) &&
    Number.isSafeInteger(record.revision) && Number(record.revision) >= 0
    ? record as unknown as InvalidationMessage
    : null;
}

export function createInvalidationChannel(onInvalidate: (message: InvalidationMessage) => void) {
  const channel = new BroadcastChannel("learning-storage-v1");
  channel.addEventListener("message", (event: MessageEvent<unknown>) => {
    const message = parseInvalidationMessage(event.data);
    if (message) onInvalidate(message);
  });
  return {
    publish(message: InvalidationMessage) { channel.postMessage(message); },
    close() { channel.close(); },
  };
}
