import type { Lesson } from './types'

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
        // key 表达课程的稳定身份，不要使用数组下标或随机数。
        <li key={lesson.id}>
          <button
            type="button"
            aria-pressed={lesson.id === selectedId}
            onClick={() => onSelect(lesson.id)}
          >
            {lesson.title} · {lesson.level}
          </button>
        </li>
      ))}
    </ul>
  )
}
