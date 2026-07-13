// @vitest-environment happy-dom
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import LessonEnrollment from './LessonEnrollment.vue'
import {
  EnrollmentError,
  type EnrollmentReceipt,
  type EnrollmentService
} from './enrollment-contract.js'

function createService(): EnrollmentService {
  return {
    enroll: vi.fn()
  }
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('LessonEnrollment', () => {
  it('submits normalized user input and renders the receipt', async () => {
    const service = createService()
    vi.mocked(service.enroll).mockResolvedValue({
      enrollmentId: 'enrollment-1',
      lessonId: 'vue-testing',
      email: 'student@example.com'
    })

    const wrapper = mount(LessonEnrollment, {
      props: { lessonId: 'vue-testing', service }
    })

    await wrapper.get('input[type="email"]').setValue('  student@example.com  ')
    await wrapper.get('form').trigger('submit')

    expect(service.enroll).toHaveBeenCalledOnce()
    expect(service.enroll).toHaveBeenCalledWith(
      'vue-testing',
      'student@example.com',
      expect.any(AbortSignal)
    )

    await flushPromises()
    expect(wrapper.get('[role="status"]').text()).toContain('enrollment-1')
    expect(wrapper.find('[role="alert"]').exists()).toBe(false)
  })

  it('prevents duplicate submission while the request is pending', async () => {
    let resolve!: (receipt: EnrollmentReceipt) => void
    const pending = new Promise<EnrollmentReceipt>((done) => {
      resolve = done
    })
    const service = createService()
    vi.mocked(service.enroll).mockReturnValue(pending)

    const wrapper = mount(LessonEnrollment, {
      props: { lessonId: 'vue-testing', service }
    })

    await wrapper.get('input').setValue('student@example.com')
    await wrapper.get('form').trigger('submit')
    await wrapper.get('form').trigger('submit')

    expect(service.enroll).toHaveBeenCalledOnce()
    expect(wrapper.get('button').attributes('disabled')).toBeDefined()

    resolve({
      enrollmentId: 'enrollment-2',
      lessonId: 'vue-testing',
      email: 'student@example.com'
    })
    await flushPromises()
    expect(wrapper.get('button').attributes('disabled')).toBeUndefined()
  })

  it('renders a domain error without discarding the email', async () => {
    const service = createService()
    vi.mocked(service.enroll).mockRejectedValue(
      new EnrollmentError('你已经报名过该课程', 'already-enrolled')
    )

    const wrapper = mount(LessonEnrollment, {
      props: { lessonId: 'vue-testing', service }
    })
    const input = wrapper.get('input')

    await input.setValue('student@example.com')
    await wrapper.get('form').trigger('submit')
    await flushPromises()

    expect(wrapper.get('[role="alert"]').text()).toBe('你已经报名过该课程')
    expect((input.element as HTMLInputElement).value).toBe('student@example.com')
  })
})
