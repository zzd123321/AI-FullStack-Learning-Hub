import type { Lesson } from './types'
import { Button } from './Button'

interface LessonListProps {
  lessons: readonly Lesson[]
  selectedId: string | null
  onSelect: (lessonId: string) => void
}

export function LessonList({ lessons, selectedId, onSelect }: LessonListProps) {
  if (lessons.length === 0) return <p>没有符合条件的课程。</p>

  return (
    <ul aria-label="课程列表">
      {lessons.map((lesson) => (
        <li key={lesson.id}>
          <Button
            aria-pressed={lesson.id === selectedId}
            onClick={() => onSelect(lesson.id)}
            tone={lesson.id === selectedId ? 'primary' : 'neutral'}
          >
            {lesson.title} · {lesson.level}
          </Button>
        </li>
      ))}
    </ul>
  )
}
