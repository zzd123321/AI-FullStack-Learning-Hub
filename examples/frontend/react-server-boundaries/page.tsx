import { notFound } from 'next/navigation'
import { CommentsSection } from './CommentsSection'
import { EnrollmentIsland } from './EnrollmentIsland'
import { InstructorCard } from './InstructorCard'
import { InteractiveShell } from './InteractiveShell'
import { getLessonForRequest } from './lesson-data.mjs'

export default async function LessonPage({
  params,
}: {
  params: Promise<{ lessonId: string }>
}) {
  const { lessonId } = await params
  const lesson = await getLessonForRequest(lessonId)
  if (!lesson) notFound()

  return (
    <InteractiveShell sidebar={<InstructorCard />}>
      <article>
        <h1>{lesson.title}</h1>
        <p>{lesson.summary}</p>
        <p>剩余 {lesson.seatsRemaining} 个名额</p>
        <EnrollmentIsland lessonId={lesson.id} />
        <CommentsSection lessonId={lesson.id} />
      </article>
    </InteractiveShell>
  )
}
