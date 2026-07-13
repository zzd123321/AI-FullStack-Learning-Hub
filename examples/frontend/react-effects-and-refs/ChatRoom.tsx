import { useState } from 'react'
import type { ConnectionFactory } from './chat-service'
import { useChatRoom } from './useChatRoom'

interface ChatRoomProps {
  createConnection: ConnectionFactory
}

export function ChatRoom({ createConnection }: ChatRoomProps) {
  const [roomId, setRoomId] = useState('general')
  const [muted, setMuted] = useState(false)
  const [notification, setNotification] = useState('')

  useChatRoom({
    serverUrl: 'https://chat.example.test',
    roomId,
    muted,
    createConnection,
    onNotification: setNotification
  })

  return (
    <section>
      <h2>聊天室连接</h2>
      <label>
        房间
        <select value={roomId} onChange={(event) => setRoomId(event.currentTarget.value)}>
          <option value="general">general</option>
          <option value="react">react</option>
          <option value="performance">performance</option>
        </select>
      </label>
      <label>
        <input
          type="checkbox"
          checked={muted}
          onChange={(event) => setMuted(event.currentTarget.checked)}
        />
        静音连接通知
      </label>
      <p aria-live="polite">{notification}</p>
    </section>
  )
}
