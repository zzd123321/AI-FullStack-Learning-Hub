export interface ChatConnection {
  connect(): void
  disconnect(): void
  onConnected(listener: () => void): () => void
}

export type ConnectionFactory = (serverUrl: string, roomId: string) => ChatConnection

export const createMockConnection: ConnectionFactory = (serverUrl, roomId) => {
  let connectedTimer: ReturnType<typeof setTimeout> | undefined
  const listeners = new Set<() => void>()

  return {
    connect() {
      console.info('connect chat', { serverUrl, roomId })
      connectedTimer = setTimeout(() => {
        for (const listener of listeners) listener()
      }, 100)
    },

    disconnect() {
      if (connectedTimer !== undefined) clearTimeout(connectedTimer)
      connectedTimer = undefined
      console.info('disconnect chat', { serverUrl, roomId })
    },

    onConnected(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    }
  }
}
