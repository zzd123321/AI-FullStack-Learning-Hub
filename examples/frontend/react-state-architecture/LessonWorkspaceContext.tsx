import {
  createContext,
  useContext,
  useReducer,
  type Dispatch,
  type ReactNode
} from 'react'
import { createInitialWorkspaceState, workspaceReducer } from './lesson-reducer'
import type { Lesson, WorkspaceAction, WorkspaceState } from './types'

const WorkspaceStateContext = createContext<WorkspaceState | null>(null)
const WorkspaceDispatchContext = createContext<Dispatch<WorkspaceAction> | null>(null)

interface LessonWorkspaceProviderProps {
  initialLessons: readonly Lesson[]
  children: ReactNode
}

export function LessonWorkspaceProvider({
  initialLessons,
  children
}: LessonWorkspaceProviderProps) {
  const [state, dispatch] = useReducer(
    workspaceReducer,
    initialLessons,
    createInitialWorkspaceState
  )

  return (
    <WorkspaceStateContext.Provider value={state}>
      <WorkspaceDispatchContext.Provider value={dispatch}>
        {children}
      </WorkspaceDispatchContext.Provider>
    </WorkspaceStateContext.Provider>
  )
}

export function useWorkspaceState(): WorkspaceState {
  const state = useContext(WorkspaceStateContext)
  if (state === null) {
    throw new Error('useWorkspaceState 必须在 LessonWorkspaceProvider 内使用')
  }
  return state
}

export function useWorkspaceDispatch(): Dispatch<WorkspaceAction> {
  const dispatch = useContext(WorkspaceDispatchContext)
  if (dispatch === null) {
    throw new Error('useWorkspaceDispatch 必须在 LessonWorkspaceProvider 内使用')
  }
  return dispatch
}
