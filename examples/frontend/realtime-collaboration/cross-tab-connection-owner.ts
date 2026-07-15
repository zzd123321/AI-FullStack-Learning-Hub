export async function runAsConnectionOwner(
  signal: AbortSignal,
  run: () => Promise<void>,
): Promise<'completed' | 'not-supported'> {
  if (!('locks' in navigator)) return 'not-supported';

  await navigator.locks.request(
    'learning-realtime-connection',
    { mode: 'exclusive', signal },
    async () => {
      await run();
    },
  );
  return 'completed';
}
export function createTabChannel(onMessage: (message: unknown) => void): {
  publish(message: unknown): void;
  close(): void;
} {
  const channel = new BroadcastChannel('learning-realtime-v1');
  channel.addEventListener('message', (event) => onMessage(event.data));
  return {
    publish: (message) => channel.postMessage(message),
    close: () => channel.close(),
  };
}
