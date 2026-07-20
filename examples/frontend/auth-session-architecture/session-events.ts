export type SessionEvent = {
  readonly version: 1;
  readonly type: 'signed-out' | 'session-changed';
  readonly at: number;
};

export function parseSessionEvent(value: unknown): SessionEvent | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const candidate = value as Partial<SessionEvent>;
  return candidate.version === 1
    && (candidate.type === 'signed-out' || candidate.type === 'session-changed')
    && Number.isSafeInteger(candidate.at)
    && (candidate.at as number) >= 0
    ? { version: 1, type: candidate.type, at: candidate.at as number }
    : null;
}

export function createSessionChannel(onEvent: (event: SessionEvent) => void): {
  publish(event: SessionEvent): void; close(): void;
} | null {
  // Cross-tab synchronization is an optimization. Authentication correctness
  // must still converge through the next server request when it is unavailable.
  if (typeof BroadcastChannel === 'undefined') return null;
  const channel = new BroadcastChannel('auth-session-events');
  channel.addEventListener('message', (event: MessageEvent<unknown>) => {
    const value = parseSessionEvent(event.data);
    if (value) onEvent(value);
  });
  return {
    publish: (event) => {
      const value = parseSessionEvent(event);
      if (!value) throw new TypeError('Invalid session event');
      channel.postMessage(value);
    },
    close: () => channel.close(),
  };
}
