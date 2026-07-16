export type SessionEvent = { readonly type: 'signed-out' | 'session-changed'; readonly at: number };

export function createSessionChannel(onEvent: (event: SessionEvent) => void): {
  publish(event: SessionEvent): void; close(): void;
} {
  const channel = new BroadcastChannel('auth-session-events');
  channel.addEventListener('message', (event: MessageEvent<unknown>) => {
    const value = event.data as Partial<SessionEvent> | null;
    if (value && (value.type === 'signed-out' || value.type === 'session-changed')
      && typeof value.at === 'number') onEvent(value as SessionEvent);
  });
  return { publish: (event) => channel.postMessage(event), close: () => channel.close() };
}
