import { expect, test } from '@playwright/test'

test.describe('课程报名关键路径', () => {
  test.beforeEach(async ({ request }) => {
    await request.post('/api/test-support/reset', {
      data: { fixture: 'pro-user-with-open-lesson' },
    })
  })

  test('用户打开课程并完成报名', async ({ page }) => {
    await page.goto('/lessons/react-testing')

    await expect(page.getByRole('heading', { name: 'React 测试策略' })).toBeVisible()
    await page.getByRole('button', { name: '报名' }).click()
    await expect(page.getByRole('status')).toHaveText('报名成功')

    await page.reload()
    await expect(page.getByText('你已报名')).toBeVisible()
  })
})
