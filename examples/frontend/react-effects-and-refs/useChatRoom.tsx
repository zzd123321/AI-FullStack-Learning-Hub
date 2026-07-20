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
  // muted 和 onNotification 始终读取最近一次已提交的值，
  // 但它们变化时不应让聊天室断开重连。
  const notifyConnected = useEffectEvent((connectedRoomId: string) => {
    if (!muted) onNotification(`已连接房间：${connectedRoomId}`)
  })

  useEffect(() => {
    const connection = createConnection(serverUrl, roomId)
    const unsubscribe = connection.onConnected(() => notifyConnected(roomId))
    connection.connect()

    return () => {
      // 先停止接收回调，再释放连接，保证 Setup 与 Cleanup 对称。
      unsubscribe()
      connection.disconnect()
    }
  }, [createConnection, roomId, serverUrl])
}
