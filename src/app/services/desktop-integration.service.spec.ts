import { TestBed } from '@angular/core/testing';

import { DesktopIntegrationService } from './desktop-integration.service';

describe('DesktopIntegrationService', () => {
  let descriptor: PropertyDescriptor | undefined;
  let api: CleanRecordDesktopApi;
  let updateListener: ((state: DesktopUpdateState) => void) | undefined;

  beforeEach(() => {
    descriptor = Object.getOwnPropertyDescriptor(window, 'cleanRecordDesktop');
    api = {
      getAppInfo: vi.fn().mockResolvedValue({
        name: 'CleanRecord',
        version: '1.0.0',
        platform: 'win32',
        updateConfigured: true
      }),
      getSettings: vi.fn().mockResolvedValue({
        autoSave: false,
        shortcuts: {
          toggle: 'Ctrl+Shift+R',
          pause: 'Ctrl+Shift+P',
          stop: 'Ctrl+Shift+X'
        }
      }),
      updateShortcuts: vi.fn().mockImplementation(async shortcuts => ({ ok: true, shortcuts })),
      updateAutoSave: vi.fn().mockImplementation(async enabled => ({
        autoSave: enabled,
        shortcuts: {
          toggle: 'Ctrl+Shift+R',
          pause: 'Ctrl+Shift+P',
          stop: 'Ctrl+Shift+X'
        }
      })),
      openMediaSettings: vi.fn().mockResolvedValue(undefined),
      startRecordingSession: vi.fn().mockResolvedValue({ sessionId: 'session-1' }),
      appendRecordingChunk: vi.fn().mockResolvedValue({ bytesWritten: 3 }),
      finishRecordingSession: vi.fn(),
      abandonRecordingSession: vi.fn().mockResolvedValue(undefined),
      saveRecording: vi.fn(),
      listHistory: vi.fn().mockResolvedValue([]),
      openRecording: vi.fn(),
      showRecordingInFolder: vi.fn().mockResolvedValue(undefined),
      removeHistoryEntry: vi.fn().mockResolvedValue([]),
      updateRecorderState: vi.fn(),
      onRecorderCommand: vi.fn(() => () => undefined),
      checkForUpdates: vi.fn().mockResolvedValue({ status: 'not-available', message: 'Actualizado' }),
      downloadUpdate: vi.fn(),
      installUpdate: vi.fn().mockResolvedValue(undefined),
      onUpdateState: vi.fn(callback => {
        updateListener = callback;
        return () => undefined;
      })
    };
    Object.defineProperty(window, 'cleanRecordDesktop', {
      configurable: true,
      value: api
    });
    TestBed.configureTestingModule({});
  });

  afterEach(() => {
    if (descriptor) {
      Object.defineProperty(window, 'cleanRecordDesktop', descriptor);
    } else {
      Reflect.deleteProperty(window, 'cleanRecordDesktop');
    }
    vi.restoreAllMocks();
  });

  it('carga identidad, preferencias e historial desde Electron', async () => {
    const service = TestBed.inject(DesktopIntegrationService);

    await vi.waitFor(() => expect(service.appInfo$.value.version).toBe('1.0.0'));

    expect(service.isDesktop).toBe(true);
    expect(api.getSettings).toHaveBeenCalledOnce();
    expect(api.listHistory).toHaveBeenCalledOnce();
  });

  it('propaga el estado de actualización y valida nuevos atajos', async () => {
    const service = TestBed.inject(DesktopIntegrationService);
    await vi.waitFor(() => expect(api.getSettings).toHaveBeenCalledOnce());

    updateListener?.({ status: 'available', message: 'Nueva versión', version: '1.1.0' });
    const result = await service.updateShortcuts({
      toggle: 'Ctrl+Alt+R',
      pause: 'Ctrl+Alt+P',
      stop: 'Ctrl+Alt+X'
    });

    expect(service.updateState$.value.version).toBe('1.1.0');
    expect(result.ok).toBe(true);
    expect(api.updateShortcuts).toHaveBeenCalledOnce();
  });
});
