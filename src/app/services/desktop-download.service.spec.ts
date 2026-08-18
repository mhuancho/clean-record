import { TestBed } from '@angular/core/testing';

import { DesktopDownloadService } from './desktop-download.service';

describe('DesktopDownloadService', () => {
  let descriptor: PropertyDescriptor | undefined;

  beforeEach(() => {
    descriptor = Object.getOwnPropertyDescriptor(window, 'cleanRecordDesktop');
    Reflect.deleteProperty(window, 'cleanRecordDesktop');
    TestBed.configureTestingModule({});
  });

  afterEach(() => {
    if (descriptor) Object.defineProperty(window, 'cleanRecordDesktop', descriptor);
    vi.restoreAllMocks();
  });

  it('publica el instalador configurado en la versión web', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        version: '1.0.0',
        size: '108 MB',
        platform: 'Windows 10 y 11 · 64 bits',
        url: 'https://ejemplo.test/CleanRecord-Setup.exe',
        detailsUrl: 'https://ejemplo.test/versiones'
      })
    });
    vi.stubGlobal('fetch', fetchMock);

    const service = TestBed.inject(DesktopDownloadService);

    await vi.waitFor(() => expect(service.download$.value).not.toBeNull());
    expect(service.download$.value).toMatchObject({
      version: '1.0.0',
      size: '108 MB',
      url: 'https://ejemplo.test/CleanRecord-Setup.exe',
      detailsUrl: 'https://ejemplo.test/versiones'
    });
  });

  it('no ofrece descarga cuando la configuración no declara una URL', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ version: '1.0.0' }) }));

    const service = TestBed.inject(DesktopDownloadService);

    await vi.waitFor(() => expect(fetch).toHaveBeenCalledOnce());
    expect(service.download$.value).toBeNull();
  });

  it('ignora un archivo ausente sin romper la aplicación', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404, json: async () => ({}) }));

    const service = TestBed.inject(DesktopDownloadService);

    await vi.waitFor(() => expect(fetch).toHaveBeenCalledOnce());
    expect(service.download$.value).toBeNull();
  });

  it('omite la consulta cuando ya se ejecuta en el escritorio', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    Object.defineProperty(window, 'cleanRecordDesktop', {
      configurable: true,
      value: { onUpdateState: vi.fn(() => () => undefined) } as unknown as CleanRecordDesktopApi
    });

    const service = TestBed.inject(DesktopDownloadService);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(service.download$.value).toBeNull();
  });
});
