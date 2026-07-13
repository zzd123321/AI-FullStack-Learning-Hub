import { useEffect, useEffectEvent } from 'react'

export function useWindowEvent<EventName extends keyof WindowEventMap>(
  eventName: EventName,
  listener: (event: WindowEventMap[EventName]) => void,
  capture = false
): void {
  const onEvent = useEffectEvent(listener)

  useEffect(() => {
    const handleEvent = (event: WindowEventMap[EventName]) => onEvent(event)
    window.addEventListener(eventName, handleEvent, { capture })

    return () => {
      window.removeEventListener(eventName, handleEvent, { capture })
    }
  }, [capture, eventName])
}
