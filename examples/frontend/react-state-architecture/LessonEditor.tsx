import type { LessonService } from './lesson-service'
import { useWorkspaceDispatch, useWorkspaceState } from './LessonWorkspaceContext'
import { PublishButton } from './PublishButton'

interface LessonEditorProps {
  service: LessonService
}

export function LessonEditor({ service }: LessonEditorProps) {
  const state = useWorkspaceState()
  const dispatch = useWorkspaceDispatch()
  const lesson = state.lessons.find((item) => item.id === state.selectedId)

  if (!lesson) return <p>请选择一门课程。</p>

  const title = state.drafts[lesson.id] ?? lesson.title
  const dirty = title !== lesson.title
  const publishing = state.publishById[lesson.id]?.status === 'publishing'

  return (
    <section>
      <h2>编辑课程</h2>
      <label>
        标题
        <input
          value={title}
          disabled={publishing}
          onChange={(event) => dispatch({
            type: 'draftChanged',
            lessonId: lesson.id,
            title: event.currentTarget.value
          })}
        />
      </label>
      <button
        type="button"
        disabled={!dirty || publishing}
        onClick={() => dispatch({ type: 'draftDiscarded', lessonId: lesson.id })}
      >
        放弃草稿
      </button>
      <PublishButton lessonId={lesson.id} service={service} />
    </section>
  )
}
