import type { LessonService } from './lesson-service'
import { useWorkspaceDispatch, useWorkspaceState } from './LessonWorkspaceContext'

interface PublishButtonProps {
  lessonId: string
  service: LessonService
}

function toMessage(cause: unknown): string {
  return cause instanceof Error ? cause.message : '发布失败'
}

export function PublishButton({ lessonId, service }: PublishButtonProps) {
  const state = useWorkspaceState()
  const dispatch = useWorkspaceDispatch()
  const publishState = state.publishById[lessonId] ?? { status: 'idle' }
  const lesson = state.lessons.find((item) => item.id === lessonId)
  const title = state.drafts[lessonId] ?? lesson?.title ?? ''

  async function publish(): Promise<void> {
    if (!lesson || publishState.status === 'publishing' || title.trim() === '') return

    const requestId = crypto.randomUUID()
    dispatch({ type: 'publishStarted', lessonId, requestId })

    try {
      const published = await service.publish(lessonId, title.trim())
      dispatch({ type: 'publishSucceeded', lesson: published, requestId })
    } catch (cause: unknown) {
      dispatch({
        type: 'publishFailed',
        lessonId,
        requestId,
        message: toMessage(cause)
      })
    }
  }

  return (
    <div>
      <button
        type="button"
        disabled={publishState.status === 'publishing' || title.trim() === ''}
        onClick={() => void publish()}
      >
        {publishState.status === 'publishing' ? '发布中…' : '发布'}
      </button>
      {publishState.status === 'error' && <p role="alert">{publishState.message}</p>}
      {publishState.status === 'success' && <p role="status">发布成功</p>}
    </div>
  )
}
