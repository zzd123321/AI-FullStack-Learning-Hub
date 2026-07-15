export interface InvalidationMessage {
  readonly version: 1;
  readonly type: "draft-changed";
  readonly draftId: string;
  readonly revision: number;
}

function parseMessage(value: unknown): InvalidationMessage | null {
  if (typeof value !== "object" || value === null) return null;
  const record = value as Record<string, unknown>;
  return record.version === 1 && record.type === "draft-changed" &&
    typeof record.draftId === "string" && typeof record.revision === "number"
    ? record as unknown as InvalidationMessage
    : null;
}

export function createInvalidationChannel(onInvalidate: (message: InvalidationMessage) => void) {
  const channel = new BroadcastChannel("learning-storage-v1");
  channel.addEventListener("message", (event: MessageEvent<unknown>) => {
    const message = parseMessage(event.data);
    if (message) onInvalidate(message);
  });
  return {
    publish(message: InvalidationMessage) { channel.postMessage(message); },
    close() { channel.close(); },
  };
}

