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
    if ((this.snapshot[lessonId] ?? 0) === normalized) return

    this.snapshot = { ...this.snapshot, [lessonId]: normalized }
    for (const listener of this.listeners) listener()
  }
}
