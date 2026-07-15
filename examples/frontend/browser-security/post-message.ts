interface EditorReadyMessage {
  readonly version: 1;
  readonly type: "editor-ready";
  readonly documentId: string;
}

const EDITOR_ORIGIN = "https://editor.example.com";

function parseEditorMessage(value: unknown): EditorReadyMessage | null {
  if (typeof value !== "object" || value === null) return null;
  const record = value as Record<string, unknown>;
  return record.version === 1 && record.type === "editor-ready" &&
    typeof record.documentId === "string"
    ? record as unknown as EditorReadyMessage
    : null;
}

export function connectEditor(
  frame: HTMLIFrameElement,
  onReady: (documentId: string) => void,
): () => void {
  const onMessage = (event: MessageEvent<unknown>) => {
    if (event.origin !== EDITOR_ORIGIN || event.source !== frame.contentWindow) return;
    const message = parseEditorMessage(event.data);
    if (message) onReady(message.documentId);
  };
  const announceHost = () => {
    frame.contentWindow?.postMessage({ version: 1, type: "host-ready" }, EDITOR_ORIGIN);
  };

  window.addEventListener("message", onMessage);
  frame.addEventListener("load", announceHost);
  return () => {
    window.removeEventListener("message", onMessage);
    frame.removeEventListener("load", announceHost);
  };
}
