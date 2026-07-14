import { memo, useState } from 'react'
import type { UIEvent } from 'react'
import type { LessonSummary } from './types'

const ROW_HEIGHT = 48
const VIEWPORT_HEIGHT = 384
const OVERSCAN = 5

const LessonRow = memo(function LessonRow({
  lesson,
  position,
  total,
}: {
  lesson: LessonSummary
  position: number
  total: number
}) {
  return (
    <article
      role="listitem"
      aria-posinset={position}
      aria-setsize={total}
      style={{
        height: ROW_HEIGHT,
        display: 'grid',
        gridTemplateColumns: '1fr auto',
        alignItems: 'center',
      }}
    >
      <span>{lesson.title}</span>
      <small>{lesson.durationMinutes} 分钟</small>
    </article>
  )
})

export function VirtualLessonList({ lessons }: { lessons: readonly LessonSummary[] }) {
  const [scrollTop, setScrollTop] = useState(0)
  const start = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN)
  const visibleCount = Math.ceil(VIEWPORT_HEIGHT / ROW_HEIGHT) + OVERSCAN * 2
  const end = Math.min(lessons.length, start + visibleCount)
  const visibleLessons = lessons.slice(start, end)

  function handleScroll(event: UIEvent<HTMLDivElement>) {
    setScrollTop(event.currentTarget.scrollTop)
  }

  return (
    <div
      onScroll={handleScroll}
      style={{ height: VIEWPORT_HEIGHT, overflow: 'auto' }}
      aria-label={`课程列表，共 ${lessons.length} 项`}
      role="list"
    >
      <div style={{ height: lessons.length * ROW_HEIGHT, position: 'relative' }}>
        <div
          style={{
            position: 'absolute',
            insetInline: 0,
            transform: `translateY(${start * ROW_HEIGHT}px)`,
          }}
        >
          {visibleLessons.map((lesson, index) => (
            <LessonRow
              key={lesson.id}
              lesson={lesson}
              position={start + index + 1}
              total={lessons.length}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
