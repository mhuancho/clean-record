import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { DesktopIntegrationService } from './desktop-integration.service';

export interface DesktopDownload {
  version: string;
  size: string;
  platform: string;
  url: string;
  detailsUrl?: string;
}

/**
 * El instalador no viaja dentro del bundle: su ubicación se publica en download.json
 * junto a la aplicación web. Sin archivo o sin URL, la descarga simplemente no se ofrece.
 */
@Injectable({ providedIn: 'root' })
export class DesktopDownloadService {
  readonly download$ = new BehaviorSubject<DesktopDownload | null>(null);

  constructor(private desktopIntegration: DesktopIntegrationService) {
    void this.load();
  }

  private async load(): Promise<void> {
    if (this.desktopIntegration.isDesktop || typeof fetch !== 'function') return;

    try {
      const url = typeof document !== 'undefined'
        ? new URL('download.json', document.baseURI).href
        : 'download.json';
      const response = await fetch(url, { cache: 'no-cache' });
      if (!response.ok) return;

      const config = await response.json() as Partial<DesktopDownload> | null;
      if (!config?.url) return;

      this.download$.next({
        url: config.url,
        version: config.version || '',
        size: config.size || '',
        platform: config.platform || 'Windows',
        ...(config.detailsUrl ? { detailsUrl: config.detailsUrl } : {})
      });
    } catch (error) {
      console.warn('No fue posible leer la configuración de descarga:', error);
    }
  }
}
