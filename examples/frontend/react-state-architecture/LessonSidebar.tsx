import { useWorkspaceDispatch, useWorkspaceState } from './LessonWorkspaceContext'

export function LessonSidebar() {
  const { lessons, selectedId } = useWorkspaceState()
  const dispatch = useWorkspaceDispatch()

  return (
    <nav aria-label="课程">
      <ul>
        {lessons.map((lesson) => (
          <li key={lesson.id}>
            <button
              type="button"
              aria-current={lesson.id === selectedId ? 'page' : undefined}
              onClick={() => dispatch({ type: 'lessonSelected', lessonId: lesson.id })}
            >
              {lesson.title} · {lesson.status}
            </button>
          </li>
        ))}
      </ul>
    </nav>
  )
}
