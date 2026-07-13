import { describe, expect, it } from 'vitest'
import { allowedLessonActions, canEnroll } from './lesson-policy.js'
import { buildAccessInput } from './test-builders.js'

describe('lesson policy', () => {
  it.each([
    ['guest cannot enroll', buildAccessInput({ role: 'guest' }), false],
    ['student can enroll in published lesson', buildAccessInput(), true],
    ['enrolled student cannot enroll twice', buildAccessInput({ enrolled: true }), false],
    ['draft lesson is closed', buildAccessInput({ status: 'draft' }), false]
  ])('%s', (_caseName, input, expected) => {
    expect(canEnroll(input)).toBe(expected)
  })

  it('gives an editor edit access without leaking student actions', () => {
    const actions = allowedLessonActions(
      buildAccessInput({ role: 'editor', enrolled: false })
    )

    expect(actions).toEqual(['preview', 'edit'])
  })
})
