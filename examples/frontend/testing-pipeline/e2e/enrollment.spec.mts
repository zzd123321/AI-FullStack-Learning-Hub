import { expect, test } from './fixtures.mjs';

test('a learner can enroll in an available course', async ({ page, courseId }) => {
  await page.goto(`/courses/${encodeURIComponent(courseId)}`);

  await expect(page.getByRole('heading', { name: 'TypeScript 工程边界' })).toBeVisible();
  await page.getByRole('button', { name: '立即报名' }).click();

  await expect(page.getByRole('status')).toHaveText('报名成功');
  await expect(page.getByRole('button', { name: '已报名' })).toBeDisabled();
});
