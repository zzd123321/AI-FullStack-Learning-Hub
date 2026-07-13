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
    () => store.getSnapshot()[lessonId] ?? 0,
    () => 0
  )
}

export function useSetLessonProgress(): ProgressStore['setProgress'] {
  return useProgressStore().setProgress
}
