import { parseServerEvent, type ClientCommand, type ServerEvent } from './protocol.js';

export interface RealtimeTransport {
  send(command: ClientCommand): boolean;
  close(): void;
}
export function connectWebSocket(
  url: string,
  onEvent: (event: ServerEvent) => void,
  onDisconnected: (event: CloseEvent) => void,
  maximumBufferedBytes = 256 * 1024,
): RealtimeTransport {
  if (!Number.isSafeInteger(maximumBufferedBytes) || maximumBufferedBytes <= 0) {
    throw new RangeError('maximumBufferedBytes must be a positive safe integer');
  }
  const socket = new WebSocket(url, 'learning-sync.v1');
  const handleMessage = (event: MessageEvent) => {
    if (typeof event.data !== 'string') return;
    try {
      onEvent(parseServerEvent(event.data));
    } catch {
      socket.close(1002, 'invalid protocol message');
    }
  };
  socket.addEventListener('message', handleMessage);
  socket.addEventListener('close', onDisconnected);

  return {
    send(command) {
      if (socket.readyState !== WebSocket.OPEN) return false;
      const payload = JSON.stringify(command);
      const payloadBytes = new TextEncoder().encode(payload).byteLength;
      if (socket.bufferedAmount + payloadBytes > maximumBufferedBytes) return false;
      socket.send(payload);
      return true;
    },
    close() {
      socket.removeEventListener('message', handleMessage);
      socket.removeEventListener('close', onDisconnected);
      socket.close(1000, 'client disposed');
    },
  };
}
