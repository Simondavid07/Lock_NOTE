import { expect, test } from '@playwright/test'
import { AxeBuilder } from '@axe-core/playwright'

for (const route of ['/', '/login', '/how-it-works']) {
  test(`public route ${route} has no serious accessibility violations`, async ({ page }) => {
    await page.goto(route)
    await expect(page.locator('main')).toBeVisible()
    await page.waitForTimeout(1_250)

    const results = await new AxeBuilder({ page }).analyze()
    const seriousOrCritical = results.violations.filter((violation) =>
      violation.impact === 'serious' || violation.impact === 'critical',
    )

    expect(seriousOrCritical, JSON.stringify(seriousOrCritical, null, 2)).toEqual([])
  })
}

test('command palette opens and closes with the keyboard', async ({ page }) => {
  await page.goto('/')
  await page.keyboard.press('Control+k')
  await expect(page.getByRole('dialog', { name: 'Command palette' })).toBeVisible()
  await expect(page.getByRole('textbox', { name: 'Search commands' })).toBeFocused()

  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog', { name: 'Command palette' })).toBeHidden()
})

test('skip link moves keyboard focus to the main landmark', async ({ page }) => {
  await page.goto('/')
  await page.keyboard.press('Tab')
  await expect(page.getByRole('link', { name: 'Skip to main content' })).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(page.locator('#main-content')).toBeFocused()
})
