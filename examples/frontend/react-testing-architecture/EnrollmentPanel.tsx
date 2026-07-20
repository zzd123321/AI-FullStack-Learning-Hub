import { useEffect, useRef, useState } from 'react'
import { checkEnrollmentEligibility, eligibilityMessage } from './enrollment-policy'
import type { EnrollmentService } from './enrollment-service'
import type { Lesson, Session } from './types'

type SubmitState =
  | { status: 'idle' }
  | { status: 'pending'; lessonId: string }
  | { status: 'success'; lessonId: string; enrollmentId: string }
  | { status: 'error'; lessonId: string; message: string }

export function EnrollmentPanel({
  lesson,
  session,
  service,
}: {
  lesson: Lesson
  session: Session
  service: EnrollmentService
}) {
  const [state, setState] = useState<SubmitState>({ status: 'idle' })
  const requestRef = useRef<{
    lessonId: string
    controller: AbortController
  } | null>(null)
  // 同一组件实例切换课程时，上一课程的提交状态不属于当前 UI。
  const currentState = state.status === 'idle' || state.lessonId === lesson.id
    ? state
    : { status: 'idle' as const }
  const eligibility = checkEnrollmentEligibility(lesson, session)
  const blockedMessage = eligibilityMessage(eligibility)

  // lesson.id 变化和组件卸载都会释放上一课程的请求。
  useEffect(() => {
    const currentLessonId = lesson.id
    return () => {
      if (requestRef.current?.lessonId === currentLessonId) {
        requestRef.current.controller.abort()
      }
    }
  }, [lesson.id])

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!eligibility.allowed || currentState.status === 'pending') return

    requestRef.current?.controller.abort()
    const controller = new AbortController()
    requestRef.current = { lessonId: lesson.id, controller }
    setState({ status: 'pending', lessonId: lesson.id })
    try {
      const receipt = await service.enroll(lesson.id, controller.signal)
      // 即使测试替身或第三方 Client 忽略 Abort，失效任务也不能再写 UI。
      if (controller.signal.aborted) return
      setState({
        status: 'success',
        lessonId: lesson.id,
        enrollmentId: receipt.enrollmentId,
      })
    } catch {
      if (!controller.signal.aborted) {
        setState({
          status: 'error',
          lessonId: lesson.id,
          message: '报名失败，请稍后重试。',
        })
      }
    } finally {
      if (requestRef.current?.controller === controller) requestRef.current = null
    }
  }

  return (
    <section aria-labelledby="enrollment-title">
      <h2 id="enrollment-title">{lesson.title}</h2>
      <p>剩余 {lesson.seatsRemaining} 个名额</p>
      {blockedMessage && <p>{blockedMessage}</p>}
      <form onSubmit={handleSubmit}>
        <button
          type="submit"
          disabled={!eligibility.allowed || currentState.status === 'pending'}
        >
          {currentState.status === 'pending' ? '报名中……' : '立即报名'}
        </button>
      </form>
      {currentState.status === 'success' && (
        <p role="status">报名成功，编号：{currentState.enrollmentId}</p>
      )}
      {currentState.status === 'error' && <p role="alert">{currentState.message}</p>}
    </section>
  )
}
