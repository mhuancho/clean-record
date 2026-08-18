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

test('autoriza la captura del monitor y el audio sin intervención del usuario', async ({}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-1366', 'El ejecutable empaquetado se valida una sola vez.');
  const executablePath = path.resolve('release', 'win-unpacked', 'CleanRecord.exe');
  test.skip(!existsSync(executablePath), 'Primero se debe ejecutar npm run desktop:package.');

  const application = await electron.launch({
    executablePath,
    env: {
      ...process.env,
      CLEANRECORD_TEST_USER_DATA: testInfo.outputPath('capture-user-data')
    }
  });

  try {
    const window = await application.firstWindow();
    await window.waitForLoadState('domcontentloaded');

    // La página se sirve desde file://, cuyo origen es opaco. El escritorio debe
    // resolver sus propios permisos sin degradar la enumeración de dispositivos.
    expect(await window.evaluate(() => navigator.permissions.query({ name: 'microphone' as PermissionName })
      .then(status => status.state))).toBe('granted');

    const microphones = await window.evaluate(() => navigator.mediaDevices.enumerateDevices()
      .then(devices => devices.filter(device => device.kind === 'audioinput')
        .map(device => ({ hasLabel: device.label.length > 0, hasId: device.deviceId.length > 0 }))));
    expect(microphones.every(microphone => microphone.hasLabel && microphone.hasId)).toBe(true);

    // getDisplayMedia solo llega al selector de pantalla si el permiso "media" sin tipos
    // declarados se acepta; de lo contrario Chromium responde NotAllowedError.
    await window.evaluate(() => {
      const button = document.createElement('button');
      button.id = 'capture-probe';
      button.textContent = 'probar captura';
      button.style.cssText = 'position:fixed;top:0;left:0;z-index:99999;width:120px;height:40px';
      button.addEventListener('click', async () => {
        try {
          const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
          (window as unknown as Record<string, unknown>)['captureProbe'] = {
            ok: true,
            kinds: stream.getTracks().map(track => track.kind).sort()
          };
          stream.getTracks().forEach(track => track.stop());
        } catch (error) {
          (window as unknown as Record<string, unknown>)['captureProbe'] = {
            ok: false,
            name: (error as DOMException).name
          };
        }
      });
      document.body.appendChild(button);
    });

    await window.click('#capture-probe');
    await window.waitForFunction(() => (window as unknown as Record<string, unknown>)['captureProbe']);
    expect(await window.evaluate(() => (window as unknown as Record<string, unknown>)['captureProbe']))
      .toEqual({ ok: true, kinds: ['audio', 'video'] });
  } finally {
    await application.close();
  }
});
