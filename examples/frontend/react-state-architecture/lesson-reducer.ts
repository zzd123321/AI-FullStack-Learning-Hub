import type {
  Lesson,
  PublishState,
  WorkspaceAction,
  WorkspaceState
} from './types.js'

export function createInitialWorkspaceState(
  lessons: readonly Lesson[]
): WorkspaceState {
  return {
    lessons: [...lessons],
    selectedId: lessons[0]?.id ?? null,
    drafts: {},
    publishById: {}
  }
}

function withoutKey<Value>(
  record: Readonly<Record<string, Value>>,
  key: string
): Record<string, Value> {
  const copy = { ...record }
  delete copy[key]
  return copy
}

function currentPublishState(
  state: WorkspaceState,
  lessonId: string
): PublishState {
  return state.publishById[lessonId] ?? { status: 'idle' }
}

function resetCompletedPublishState(
  state: WorkspaceState,
  lessonId: string
): WorkspaceState['publishById'] {
  const current = currentPublishState(state, lessonId)
  return current.status === 'publishing'
    ? state.publishById
    : withoutKey(state.publishById, lessonId)
}

function assertNever(value: never): never {
  throw new Error(`未知 Action：${JSON.stringify(value)}`)
}

export function workspaceReducer(
  state: WorkspaceState,
  action: WorkspaceAction
): WorkspaceState {
  switch (action.type) {
    case 'lessonSelected':
      return state.selectedId === action.lessonId
        ? state
        : { ...state, selectedId: action.lessonId }

    case 'draftChanged':
      return {
        ...state,
        drafts: { ...state.drafts, [action.lessonId]: action.title },
        publishById: resetCompletedPublishState(state, action.lessonId)
      }

    case 'draftDiscarded':
      return {
        ...state,
        drafts: withoutKey(state.drafts, action.lessonId),
        publishById: resetCompletedPublishState(state, action.lessonId)
      }

    case 'publishStarted':
      return {
        ...state,
        publishById: {
          ...state.publishById,
          [action.lessonId]: {
            status: 'publishing',
            requestId: action.requestId
          }
        }
      }

    case 'publishSucceeded': {
      const current = currentPublishState(state, action.lesson.id)
      if (current.status !== 'publishing' || current.requestId !== action.requestId) {
        return state
      }

      return {
        ...state,
        lessons: state.lessons.map((lesson) =>
          lesson.id === action.lesson.id ? action.lesson : lesson
        ),
        drafts: withoutKey(state.drafts, action.lesson.id),
        publishById: {
          ...state.publishById,
          [action.lesson.id]: { status: 'success' }
        }
      }
    }

    case 'publishFailed': {
      const current = currentPublishState(state, action.lessonId)
      if (current.status !== 'publishing' || current.requestId !== action.requestId) {
        return state
      }

      return {
        ...state,
        publishById: {
          ...state.publishById,
          [action.lessonId]: { status: 'error', message: action.message }
        }
      }
    }

    default:
      return assertNever(action)
  }
}
