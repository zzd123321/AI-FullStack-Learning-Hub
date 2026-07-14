import type { Eligibility, Lesson, Session } from './types.js'

export function checkEnrollmentEligibility(
  lesson: Lesson,
  session: Session,
): Eligibility {
  if (!session.authenticated) return { allowed: false, reason: 'sign-in' }
  if (lesson.seatsRemaining <= 0) return { allowed: false, reason: 'sold-out' }
  if (lesson.requiredPlan === 'pro' && session.plan !== 'pro') {
    return { allowed: false, reason: 'upgrade' }
  }
  return { allowed: true }
}

export function eligibilityMessage(eligibility: Eligibility): string | null {
  if (eligibility.allowed) return null
  return {
    'sign-in': '登录后才能报名。',
    upgrade: '升级到 Pro 后才能报名。',
    'sold-out': '本课程名额已满。',
  }[eligibility.reason]
}
