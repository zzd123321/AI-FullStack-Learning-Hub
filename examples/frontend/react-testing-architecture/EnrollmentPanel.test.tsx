import { screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { EnrollmentPanel } from './EnrollmentPanel'
import { buildLesson, buildSession } from './test-builders'
import { createService, deferred, renderWithUser } from './test-utils'
import type { EnrollmentReceipt } from './types'

describe('EnrollmentPanel', () => {
  it('从用户视角完成报名，并在请求期间阻止重复提交', async () => {
    const request = deferred<EnrollmentReceipt>()
    const enroll = vi.fn(() => request.promise)
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
})
