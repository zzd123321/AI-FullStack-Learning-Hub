import type { PublicLesson } from './types'

// No directive: in an RSC-enabled framework this is a Server Component by default.
export function LessonSummary({ lesson }: { lesson: PublicLesson }) {
  return (
    <article>
      <h1>{lesson.title}</h1>
      <p>{lesson.summary}</p>
      <p>剩余名额：{lesson.seatsRemaining}</p>
    </article>
  )
}
