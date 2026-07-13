type EventHandler<Payload> = (payload: Payload) => void

export interface TypedEmitter<Events extends object> {
  on<Key extends keyof Events>(
    event: Key,
    handler: EventHandler<Events[Key]>
  ): () => void
  emit<Key extends keyof Events>(event: Key, payload: Events[Key]): void
  clear(): void
}

export function createTypedEmitter<Events extends object>(): TypedEmitter<Events> {
  type AnyPayload = Events[keyof Events]
  type AnyHandler = EventHandler<AnyPayload>
  const listeners = new Map<keyof Events, Set<AnyHandler>>()

  return {
    on(event, handler) {
      const handlers = listeners.get(event) ?? new Set<AnyHandler>()
      const compatibleHandler = handler as AnyHandler
      handlers.add(compatibleHandler)
      listeners.set(event, handlers)

      return () => {
        handlers.delete(compatibleHandler)
        if (handlers.size === 0) listeners.delete(event)
      }
    },

    emit(event, payload) {
      for (const handler of listeners.get(event) ?? []) handler(payload)
    },

    clear() {
      listeners.clear()
    }
  }
}
