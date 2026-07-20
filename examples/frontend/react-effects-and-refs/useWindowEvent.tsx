import { useEffect, useEffectEvent } from 'react'

export function useWindowEvent<EventName extends keyof WindowEventMap>(
  eventName: EventName,
  listener: (event: WindowEventMap[EventName]) => void,
  capture = false
): void {
  // listener 可以读取最新 State，但 listener 身份变化不需要重新订阅窗口事件。
  const onEvent = useEffectEvent(listener)

  useEffect(() => {
    // Cleanup 必须拿到和注册时完全相同的函数与 capture 值。
    const handleEvent = (event: WindowEventMap[EventName]) => onEvent(event)
    window.addEventListener(eventName, handleEvent, { capture })

    return () => {
      window.removeEventListener(eventName, handleEvent, { capture })
    }
  }, [capture, eventName])
}
