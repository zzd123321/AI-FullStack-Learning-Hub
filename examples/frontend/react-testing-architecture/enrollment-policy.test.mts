import { describe, expect, it } from 'vitest'
import { checkEnrollmentEligibility } from './enrollment-policy.js'
import { buildLesson, buildSession } from './test-builders.js'

describe('checkEnrollmentEligibility', () => {
  it.each([
    {
      name: '未登录',
      lesson: buildLesson(),
      session: buildSession({ authenticated: false }),
      expected: { allowed: false, reason: 'sign-in' },
    },
    {
      name: '名额已满',
      lesson: buildLesson({ seatsRemaining: 0 }),
      session: buildSession(),
      expected: { allowed: false, reason: 'sold-out' },
    },
    {
      name: '套餐不足',
      lesson: buildLesson({ requiredPlan: 'pro' }),
      session: buildSession({ plan: 'free' }),
      expected: { allowed: false, reason: 'upgrade' },
    },
  ])('$name 时拒绝报名', ({ lesson, session, expected }) => {
    expect(checkEnrollmentEligibility(lesson, session)).toEqual(expected)
  })

  it('条件满足时允许报名', () => {
    expect(checkEnrollmentEligibility(buildLesson(), buildSession()))
      .toEqual({ allowed: true })
  })
})
