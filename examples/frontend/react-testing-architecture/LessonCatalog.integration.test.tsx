import { HttpResponse, http } from 'msw'
import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { LessonCatalog } from './LessonCatalog'
import { httpEnrollmentService } from './enrollment-service'
import { server } from './test-server'
import { renderWithUser } from './test-utils'

describe('LessonCatalog network boundary', () => {
  it('通过真实 Fetch 与协议 Mock 渲染课程', async () => {
    renderWithUser(<LessonCatalog service={httpEnrollmentService} />)

    expect(screen.getByRole('status')).toHaveTextContent('正在加载')
    expect(await screen.findByRole('list', { name: '课程' })).toBeVisible()
    expect(screen.getByText('React 测试策略')).toBeVisible()
  })

  it('首次 503 后允许用户重试', async () => {
    let calls = 0
    server.use(http.get('/api/lessons', () => {
      calls += 1
      return calls === 1
        ? new HttpResponse(null, { status: 503 })
        : HttpResponse.json([])
    }))
    const { user } = renderWithUser(<LessonCatalog service={httpEnrollmentService} />)

    expect(await screen.findByRole('alert')).toHaveTextContent('加载失败')
    await user.click(screen.getByRole('button', { name: '重试' }))
    expect(await screen.findByText('暂无课程。')).toBeVisible()
    expect(calls).toBe(2)
  })
})
