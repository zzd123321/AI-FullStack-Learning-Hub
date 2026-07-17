import { ClientFilters } from './ClientFilters'
import { EnrollmentForm } from './EnrollmentForm'
import { LessonSummary } from './LessonSummary'
import { getPublicLesson } from './server/lesson-repository'

// Server Component: it may await data but cannot use browser hooks or event handlers.
export default async function LessonPage({
  params,
  commandToken,
}: {
  params: { lessonId: string }
  // The framework route adapter creates this request-scoped token before RSC render.
  commandToken: string
}) {
  const lesson = await getPublicLesson(params.lessonId)
  const canEnroll = lesson.seatsRemaining > 0 && !lesson.enrolled

  return (
    <main>
      <LessonSummary lesson={lesson} />
      <EnrollmentForm
        lessonId={lesson.id}
        canEnroll={canEnroll}
        idempotencyKey={commandToken}
      />
      <ClientFilters>
        {/* Server-rendered JSX can be passed through a Client Component as children. */}
        <p>筛选状态由 URL Search Params 在服务器读取并用于下一次 RSC 渲染。</p>
      </ClientFilters>
    </main>
  )
}
