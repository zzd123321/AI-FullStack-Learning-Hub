import { useEffect, useEffectEvent } from 'react'
import type { ConnectionFactory } from './chat-service'

interface UseChatRoomOptions {
  serverUrl: string
  roomId: string
  muted: boolean
  createConnection: ConnectionFactory
  onNotification: (message: string) => void
}

export function useChatRoom({
  serverUrl,
  roomId,
  muted,
  createConnection,
  onNotification
}: UseChatRoomOptions): void {
  const notifyConnected = useEffectEvent((connectedRoomId: string) => {
    if (!muted) onNotification(`已连接房间：${connectedRoomId}`)
  })

  useEffect(() => {
    const connection = createConnection(serverUrl, roomId)
    const unsubscribe = connection.onConnected(() => notifyConnected(roomId))
    connection.connect()

    return () => {
      unsubscribe()
      connection.disconnect()
    }
  }, [createConnection, roomId, serverUrl])
}
