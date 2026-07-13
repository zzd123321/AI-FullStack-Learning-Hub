import { expect, test } from '@playwright/test'

test('student enrolls in a lesson', async ({ page }) => {
  await page.route('**/api/enrollments', async (route) => {
    const request = route.request()
    const body = request.postDataJSON() as {
      lessonId: string
      email: string
    }

    expect(body).toEqual({
      lessonId: 'vue-testing',
      email: 'student@example.com'
    })

    await route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: JSON.stringify({ enrollmentId: 'enrollment-e2e-1' })
    })
  })

  await page.goto('/lessons/vue-testing')
  await expect(page.getByRole('heading', { name: 'Vue 测试课程' })).toBeVisible()

  await page.getByLabel('邮箱').fill('student@example.com')
  await page.getByRole('button', { name: '确认报名' }).click()

  await expect(page.getByRole('status')).toContainText('enrollment-e2e-1')
})
