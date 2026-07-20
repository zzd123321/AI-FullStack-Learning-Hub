export type ProgressSnapshot = Readonly<Record<string, number>>

export class ProgressStore {
  private snapshot: ProgressSnapshot
  private readonly listeners = new Set<() => void>()

  constructor(initialSnapshot: ProgressSnapshot = {}) {
    this.snapshot = { ...initialSnapshot }
  }

  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  readonly getSnapshot = (): ProgressSnapshot => this.snapshot

  readonly setProgress = (lessonId: string, progress: number): void => {
    const normalized = Math.max(0, Math.min(100, Math.round(progress)))
    // 值没变就保留同一个 Snapshot 引用，也不通知订阅者。
    if ((this.snapshot[lessonId] ?? 0) === normalized) return

    // 只有真实更新才创建新快照，满足 useSyncExternalStore 的缓存契约。
    this.snapshot = { ...this.snapshot, [lessonId]: normalized }
    for (const listener of this.listeners) listener()
  }
}
