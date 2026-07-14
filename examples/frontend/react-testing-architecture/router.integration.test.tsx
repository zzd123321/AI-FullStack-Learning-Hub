import { RouterProvider } from 'react-router/dom'
import { screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { buildLesson } from './test-builders'
import { createTestRouter } from './router'
import { createService, renderWithUser } from './test-utils'

describe('lesson route', () => {
  it('串联 Loader、页面、Form Action 与成功反馈', async () => {
    const service = createService({
      getLesson: vi.fn(async () => buildLesson()),
      enroll: vi.fn(async (lessonId) => ({
        enrollmentId: 'route-enrollment-1',
        lessonId,
        createdAt: '2026-07-14T00:00:00.000Z',
      })),
    })
    const router = createTestRouter(service, ['/lessons/react-testing'])
    const { user } = renderWithUser(<RouterProvider router={router} />)

    expect(await screen.findByRole('heading', { name: 'React 测试策略' })).toBeVisible()
    await user.click(screen.getByRole('button', { name: '报名' }))
    expect(await screen.findByRole('status')).toHaveTextContent('报名成功')
    expect(service.enroll).toHaveBeenCalledWith('react-testing', expect.any(AbortSignal))
  })

  it('未知课程由 Route Error Boundary 接管', async () => {
    const router = createTestRouter(createService(), ['/lessons/missing'])
    renderWithUser(<RouterProvider router={router} />)
    expect(await screen.findByRole('alert')).toHaveTextContent('页面暂时不可用')
  })
})
