import { _electron as electron, expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { existsSync } from 'node:fs';
import path from 'node:path';

test('abre el ejecutable Windows empaquetado con el puente seguro', async ({}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-1366', 'El ejecutable empaquetado se valida una sola vez.');
  const executablePath = path.resolve('release', 'win-unpacked', 'CleanRecord.exe');
  test.skip(!existsSync(executablePath), 'Primero se debe ejecutar npm run desktop:package.');

  const application = await electron.launch({
    executablePath,
    env: {
      ...process.env,
      CLEANRECORD_TEST_USER_DATA: testInfo.outputPath('packaged-user-data')
    }
  });

  try {
    const window = await application.firstWindow();
    await window.waitForLoadState('domcontentloaded');
    const state = await window.evaluate(async () => ({
      title: document.title,
      info: await window.cleanRecordDesktop?.getAppInfo()
    }));

    expect(state.title).toBe('CleanRecord | Grabador de pantalla');
    expect(state.info).toMatchObject({
      name: 'CleanRecord',
      version: '1.0.0',
      platform: 'win32',
      updateConfigured: false
    });

    await window.getByRole('button', { name: 'Abrir información y preferencias' }).click();
    await expect(window.getByRole('heading', { name: 'Información y preferencias' })).toBeVisible();
    await window.locator('input[name="autoSave"]').check({ force: true });
    await expect.poll(async () => (await window.evaluate(() => window.cleanRecordDesktop?.getSettings()))?.autoSave)
      .toBe(true);

    const accessibility = await new AxeBuilder({ page: window }).setLegacyMode(true).analyze();
    expect(accessibility.violations.filter(violation =>
      violation.impact === 'critical' || violation.impact === 'serious'
    )).toEqual([]);
  } finally {
    await application.close();
  }
});
