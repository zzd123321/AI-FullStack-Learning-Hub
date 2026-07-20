import { act, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { EnrollmentPanel } from './EnrollmentPanel'
import { buildLesson, buildSession } from './test-builders'
import { createService, deferred, renderWithUser } from './test-utils'
import type { EnrollmentReceipt } from './types'

describe('EnrollmentPanel', () => {
  it('从用户视角完成报名，并在请求期间阻止重复提交', async () => {
    const request = deferred<EnrollmentReceipt>()
    const enroll = vi.fn((_lessonId: string, _signal?: AbortSignal) => request.promise)
    const service = createService({ enroll })
    const { user } = renderWithUser(
      <EnrollmentPanel
        lesson={buildLesson()}
        session={buildSession()}
        service={service}
      />,
    )

    await user.click(screen.getByRole('button', { name: '立即报名' }))

    expect(screen.getByRole('button', { name: '报名中……' })).toBeDisabled()
    expect(enroll).toHaveBeenCalledOnce()
    expect(enroll).toHaveBeenCalledWith('react-testing', expect.any(AbortSignal))

    request.resolve({
      enrollmentId: 'enrollment-1',
      lessonId: 'react-testing',
      createdAt: '2026-07-14T00:00:00.000Z',
    })
    expect(await screen.findByRole('status')).toHaveTextContent('enrollment-1')
  })

  it('套餐不足时解释原因且不调用服务', async () => {
    const enroll = vi.fn()
    const { user } = renderWithUser(
      <EnrollmentPanel
        lesson={buildLesson({ requiredPlan: 'pro' })}
        session={buildSession({ plan: 'free' })}
        service={createService({ enroll })}
      />,
    )

    expect(screen.getByText('升级到 Pro 后才能报名。')).toBeVisible()
    await user.click(screen.getByRole('button', { name: '立即报名' }))
    expect(enroll).not.toHaveBeenCalled()
  })

  it('请求失败时显示可访问错误', async () => {
    const service = createService({
      enroll: vi.fn(async () => { throw new Error('offline') }),
    })
    const { user } = renderWithUser(
      <EnrollmentPanel lesson={buildLesson()} session={buildSession()} service={service} />,
    )

    await user.click(screen.getByRole('button', { name: '立即报名' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('报名失败')
  })

  it('切换课程时取消旧请求，且旧结果不能污染新课程', async () => {
    const request = deferred<EnrollmentReceipt>()
    const enroll = vi.fn((_lessonId: string, _signal?: AbortSignal) => request.promise)
    const service = createService({ enroll })
    const firstLesson = buildLesson({ id: 'lesson-a', title: '课程 A' })
    const secondLesson = buildLesson({ id: 'lesson-b', title: '课程 B' })
    const { rerender, user } = renderWithUser(
      <EnrollmentPanel lesson={firstLesson} session={buildSession()} service={service} />,
    )

    await user.click(screen.getByRole('button', { name: '立即报名' }))
    const signal = enroll.mock.calls[0]?.[1]
    expect(signal).toBeInstanceOf(AbortSignal)

    rerender(
      <EnrollmentPanel lesson={secondLesson} session={buildSession()} service={service} />,
    )
    expect(signal?.aborted).toBe(true)
    expect(screen.getByRole('heading', { name: '课程 B' })).toBeVisible()

    await act(async () => {
      request.resolve({
        enrollmentId: 'old-enrollment',
        lessonId: 'lesson-a',
        createdAt: '2026-07-20T00:00:00.000Z',
      })
      await request.promise
    })
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })
})
