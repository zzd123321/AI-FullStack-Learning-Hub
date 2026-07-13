import { useState } from 'react'
import { useWindowEvent } from './useWindowEvent'

export function PointerTracker() {
  const [enabled, setEnabled] = useState(true)
  const [position, setPosition] = useState({ x: 0, y: 0 })

  useWindowEvent('pointermove', (event) => {
    if (enabled) setPosition({ x: event.clientX, y: event.clientY })
  })

  return (
    <section>
      <h2>窗口订阅</h2>
      <label>
        <input
          type="checkbox"
          checked={enabled}
          onChange={(event) => setEnabled(event.currentTarget.checked)}
        />
        跟踪指针
      </label>
      <output>坐标：{position.x}, {position.y}</output>
    </section>
  )
}
