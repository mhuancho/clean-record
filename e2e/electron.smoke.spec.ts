import { _electron as electron, expect, test } from '@playwright/test';

test('inicia Electron, escribe fragmentos y mantiene historial recuperable', async ({}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-1366', 'El arranque Electron se valida una sola vez.');
  test.setTimeout(120_000);

  const application = await electron.launch({
    args: ['.'],
    env: {
      ...process.env,
      CLEANRECORD_TEST_USER_DATA: testInfo.outputPath('electron-user-data')
    }
  });
  try {
    const window = await application.firstWindow();
    await window.waitForLoadState('domcontentloaded');
    await expect(window.getByRole('heading', { name: 'Grabador de pantalla' })).toBeVisible();

    const result = await window.evaluate(async () => {
      const api = window.cleanRecordDesktop;
      if (!api) return { hasDesktopBridge: false };
      const recordingSession = await api.startRecordingSession({ mimeType: 'video/webm', quality: '1080p' });
      const simulatedSecond = new Uint8Array(1024);
      for (let second = 0; second < 3600; second++) {
        simulatedSecond[0] = second % 256;
        await api.appendRecordingChunk(recordingSession.sessionId, simulatedSecond.buffer);
      }
      const finalized = await api.finishRecordingSession(recordingSession.sessionId, {
        name: 'prueba-progresiva-1h',
        duration: '60:00',
        resolution: '1920 × 1080',
        frameRate: '30 FPS',
        audio: 'Sin audio'
      });
      const history = await api.listHistory();
      await api.removeHistoryEntry({ id: finalized.entry.id, deleteFile: true });
      return {
        hasDesktopBridge: true,
        info: await api.getAppInfo(),
        settings: await api.getSettings(),
        history,
        writtenEntry: finalized.entry
      };
    });

    expect(result.hasDesktopBridge).toBe(true);
    expect(result.info).toMatchObject({
      name: 'CleanRecord',
      version: '1.0.0',
      platform: 'win32'
    });
    expect(result.settings?.shortcuts).toEqual({
      toggle: 'CommandOrControl+Shift+R',
      pause: 'CommandOrControl+Shift+P',
      stop: 'CommandOrControl+Shift+X'
    });
    expect(Array.isArray(result.history)).toBe(true);
    expect(result.history).toHaveLength(1);
    expect(result.writtenEntry).toMatchObject({
      name: 'prueba-progresiva-1h.webm',
      size: 3_686_400,
      saved: false
    });
  } finally {
    await application.close();
  }
});
