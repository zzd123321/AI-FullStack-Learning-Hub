import { expect, test } from '@playwright/test';

for (const theme of ['light', 'dark'] as const) {
  test(`tabs visual contract: ${theme}`, async ({ page }) => {
    await page.goto(`/design-system/tabs.html?theme=${theme}`);
    await page.emulateMedia({ reducedMotion: 'reduce', colorScheme: theme });
    const tabs = page.locator('ds-tabs');
    await expect(tabs).toBeVisible();
    await expect(tabs).toHaveScreenshot(`tabs-${theme}.png`, {
      animations: 'disabled',
      caret: 'hide',
    });
  });
}
