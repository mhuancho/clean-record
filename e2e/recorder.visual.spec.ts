import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const mediaDevices = navigator.mediaDevices;
    Object.defineProperties(mediaDevices, {
      getDisplayMedia: {
        configurable: true,
        value: async () => {
          const canvas = document.createElement('canvas');
          canvas.width = 1920;
          canvas.height = 1080;
          const context = canvas.getContext('2d');
          if (context) {
            context.fillStyle = '#111827';
            context.fillRect(0, 0, canvas.width, canvas.height);
            context.fillStyle = '#818cf8';
            context.font = '64px sans-serif';
            context.fillText('CleanRecord visual test', 80, 130);
          }
          return canvas.captureStream(30);
        }
      },
      getUserMedia: {
        configurable: true,
        value: async () => new MediaStream()
      },
      enumerateDevices: {
        configurable: true,
        value: async () => []
      },
      getSupportedConstraints: {
        configurable: true,
        value: () => ({})
      }
    });
  });
  await page.goto('/');
});

test('mantiene la composición profesional en los breakpoints definidos', async ({ page }) => {
  await expect(page.getByRole('heading', { name: 'Grabador de pantalla' })).toBeVisible();
  await expect(page.locator('aside')).toBeVisible();
  await expect(page.locator('section').filter({ hasText: 'Vista previa de captura' })).toBeVisible();
  await expect(page).toHaveScreenshot('estado-inicial.png', {
    animations: 'disabled',
    fullPage: true,
    maxDiffPixelRatio: 0.01
  });
});

test('completa el flujo de grabación simulado', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-1366', 'El flujo funcional se ejecuta una vez en escritorio.');
  await page.locator('input[name="includeMicrophone"]').uncheck({ force: true });
  await page.locator('input[name="includeSystemAudio"]').uncheck({ force: true });
  await page.getByRole('button', { name: 'Iniciar grabación' }).click();
  await expect(page.getByText('Grabando', { exact: true })).toBeVisible({ timeout: 7_000 });
  await page.getByRole('button', { name: 'Detener' }).click();
  await expect(page.getByRole('heading', { name: 'Grabación lista' })).toBeVisible({ timeout: 7_000 });
  await expect(page).toHaveScreenshot('resultado-final.png', {
    animations: 'disabled',
    fullPage: true,
    maxDiffPixelRatio: 0.01
  });
});

test('no presenta problemas serios de accesibilidad', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-1366', 'La auditoría completa se ejecuta una vez en escritorio.');
  const results = await new AxeBuilder({ page }).analyze();
  const blockingViolations = results.violations.filter(violation =>
    violation.impact === 'critical' || violation.impact === 'serious'
  );
  expect(blockingViolations).toEqual([]);
});
