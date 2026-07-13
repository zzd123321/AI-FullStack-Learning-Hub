import type { ReactNode } from 'react'
import type { RemoteData } from './types'

interface RemoteDataViewProps<T> {
  state: RemoteData<T>
  children: (data: T) => ReactNode
}

export function RemoteDataView<T>({ state, children }: RemoteDataViewProps<T>) {
  switch (state.status) {
    case 'idle':
      return <p>尚未加载。</p>
    case 'loading':
      return <p aria-live="polite">加载中…</p>
    case 'success':
      return <>{children(state.data)}</>
    case 'error':
      return <p role="alert">{state.message}</p>
  }
}
