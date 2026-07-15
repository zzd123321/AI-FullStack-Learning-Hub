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
  const socket = new WebSocket(url, 'learning-sync.v1');
  socket.addEventListener('message', (event) => {
    if (typeof event.data !== 'string') return;
    try {
      onEvent(parseServerEvent(event.data));
    } catch {
      socket.close(1002, 'invalid protocol message');
    }
  });
  socket.addEventListener('close', onDisconnected);

  return {
    send(command) {
      if (socket.readyState !== WebSocket.OPEN) return false;
      if (socket.bufferedAmount >= maximumBufferedBytes) return false;
      socket.send(JSON.stringify(command));
      return true;
    },
    close() {
      socket.removeEventListener('close', onDisconnected);
      socket.close(1000, 'client disposed');
    },
  };
}
