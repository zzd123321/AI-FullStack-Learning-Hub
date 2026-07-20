import {
  createContext,
  useContext,
  useState,
  useSyncExternalStore,
  type ReactNode
} from 'react'
import { ProgressStore, type ProgressSnapshot } from './progress-store'

const ProgressStoreContext = createContext<ProgressStore | null>(null)

interface ProgressProviderProps {
  initialProgress?: ProgressSnapshot
  children: ReactNode
}

export function ProgressProvider({
  initialProgress = {},
  children
}: ProgressProviderProps) {
  // Lazy initializer 保证同一个 Provider 生命周期内只创建一个 Store 实例。
  const [store] = useState(() => new ProgressStore(initialProgress))
  return (
    <ProgressStoreContext.Provider value={store}>
      {children}
    </ProgressStoreContext.Provider>
  )
}

function useProgressStore(): ProgressStore {
  const store = useContext(ProgressStoreContext)
  if (store === null) throw new Error('Progress Hook 必须在 ProgressProvider 内使用')
  return store
}

export function useLessonProgress(lessonId: string): number {
  const store = useProgressStore()
  return useSyncExternalStore(
    store.subscribe,
    // Selector 返回 Primitive；其他课程变化时，本课程的快照可以保持相等。
    () => store.getSnapshot()[lessonId] ?? 0,
    // 本示例约定服务端也渲染 0；真实 SSR 必须交接同一份初始快照。
    () => 0
  )
}

export function useSetLessonProgress(): ProgressStore['setProgress'] {
  return useProgressStore().setProgress
}
