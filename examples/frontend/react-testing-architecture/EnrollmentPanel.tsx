import { useEffect, useRef, useState } from 'react'
import { checkEnrollmentEligibility, eligibilityMessage } from './enrollment-policy'
import type { EnrollmentService } from './enrollment-service'
import type { Lesson, Session } from './types'

type SubmitState =
  | { status: 'idle' }
  | { status: 'pending' }
  | { status: 'success'; enrollmentId: string }
  | { status: 'error'; message: string }

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
  const controllerRef = useRef<AbortController | null>(null)
  const eligibility = checkEnrollmentEligibility(lesson, session)
  const blockedMessage = eligibilityMessage(eligibility)

  useEffect(() => () => controllerRef.current?.abort(), [])

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!eligibility.allowed || state.status === 'pending') return

    controllerRef.current?.abort()
    const controller = new AbortController()
    controllerRef.current = controller
    setState({ status: 'pending' })
    try {
      const receipt = await service.enroll(lesson.id, controller.signal)
      setState({ status: 'success', enrollmentId: receipt.enrollmentId })
    } catch (error) {
      if (!(error instanceof DOMException && error.name === 'AbortError')) {
        setState({ status: 'error', message: '报名失败，请稍后重试。' })
      }
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
          disabled={!eligibility.allowed || state.status === 'pending'}
        >
          {state.status === 'pending' ? '报名中……' : '立即报名'}
        </button>
      </form>
      {state.status === 'success' && (
        <p role="status">报名成功，编号：{state.enrollmentId}</p>
      )}
      {state.status === 'error' && <p role="alert">{state.message}</p>}
    </section>
  )
}
