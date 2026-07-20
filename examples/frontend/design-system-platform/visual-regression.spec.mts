import { expect, test } from '@playwright/test';

for (const theme of ['light', 'dark'] as const) {
  test(`tabs visual contract: ${theme}`, async ({ page }) => {
    await page.goto(`/design-system/tabs.html?theme=${theme}`);
    await page.emulateMedia({ reducedMotion: 'reduce', colorScheme: theme });
    const tabs = page.locator('ds-tabs');
    await expect(tabs).toBeVisible();
    // 字体切换会改变字形宽度，是最常见的视觉基线噪声之一。
    await page.evaluate(() => document.fonts.ready);
    await expect(tabs).toHaveScreenshot(`tabs-${theme}.png`, {
      animations: 'disabled',
      caret: 'hide',
    });

    // Focus 是独立视觉状态，不能只用默认静态截图间接覆盖。
    await tabs.locator('[role="tab"]').first().focus();
    await expect(tabs).toHaveScreenshot(`tabs-${theme}-focus.png`, {
      animations: 'disabled',
      caret: 'hide',
    });
  });
}
