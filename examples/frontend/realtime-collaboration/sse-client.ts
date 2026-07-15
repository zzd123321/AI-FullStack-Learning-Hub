import { parseServerEvent, type ServerEvent } from './protocol.js';

export function subscribeWithEventSource(
  url: string,
  onEvent: (event: ServerEvent) => void,
  onError: () => void,
): () => void {
  // EventSource reconnects automatically and sends Last-Event-ID when the server supplies IDs.
  const source = new EventSource(url, { withCredentials: true });
  const handleMessage = (event: MessageEvent<string>) => {
    try {
      onEvent(parseServerEvent(event.data));
    } catch {
      source.close();
      onError();
    }
  };
  source.addEventListener('message', handleMessage);
  source.addEventListener('error', onError);
  return () => {
    source.removeEventListener('message', handleMessage);
    source.removeEventListener('error', onError);
    source.close();
  };
}
