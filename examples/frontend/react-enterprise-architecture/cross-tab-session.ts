export type SessionMessage =
  | { readonly version: 1; readonly type: "session-invalidated"; readonly reason: string }
  | { readonly version: 1; readonly type: "permissions-changed" };

function isSessionMessage(value: unknown): value is SessionMessage {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    record.version === 1 &&
    ((record.type === "permissions-changed") ||
      (record.type === "session-invalidated" && typeof record.reason === "string"))
  );
}

export function createSessionChannel(onMessage: (message: SessionMessage) => void): {
  publish(message: SessionMessage): void;
  close(): void;
} {
  const channel = new BroadcastChannel("learning-session-v1");
  channel.addEventListener("message", (event: MessageEvent<unknown>) => {
    if (isSessionMessage(event.data)) onMessage(event.data);
  });

  return {
    publish: (message) => channel.postMessage(message),
    close: () => channel.close(),
  };
}
