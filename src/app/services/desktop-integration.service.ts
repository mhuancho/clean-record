import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

const DEFAULT_SHORTCUTS: DesktopShortcutSettings = {
  toggle: 'CommandOrControl+Shift+R',
  pause: 'CommandOrControl+Shift+P',
  stop: 'CommandOrControl+Shift+X'
};

@Injectable({ providedIn: 'root' })
export class DesktopIntegrationService {
  private readonly api = typeof window !== 'undefined' ? window.cleanRecordDesktop : undefined;
  private removeUpdateListener?: () => void;

  readonly isDesktop = Boolean(this.api);
  readonly appInfo$ = new BehaviorSubject<DesktopAppInfo>({
    name: 'CleanRecord',
    version: 'web',
    platform: 'web',
    updateConfigured: false
  });
  readonly settings$ = new BehaviorSubject<{ shortcuts: DesktopShortcutSettings; lastSaveDirectory?: string; autoSave: boolean }>({
    shortcuts: { ...DEFAULT_SHORTCUTS },
    autoSave: false
  });
  readonly history$ = new BehaviorSubject<DesktopRecordingEntry[]>([]);
  readonly updateState$ = new BehaviorSubject<DesktopUpdateState>({
    status: 'disabled',
    message: 'Las actualizaciones se administran en la versión de escritorio.'
  });

  constructor() {
    if (!this.api) return;
    this.removeUpdateListener = this.api.onUpdateState(state => this.updateState$.next(state));
    void this.refresh();
  }

  async refresh(): Promise<void> {
    if (!this.api) return;
    const [appInfo, settings, history] = await Promise.all([
      this.api.getAppInfo(),
      this.api.getSettings(),
      this.api.listHistory()
    ]);
    this.appInfo$.next(appInfo);
    this.settings$.next(settings);
    this.history$.next(history);
  }

  onRecorderCommand(callback: (command: 'toggle-recording' | 'pause' | 'resume' | 'stop') => void): () => void {
    return this.api?.onRecorderCommand(callback) ?? (() => undefined);
  }

  updateRecorderState(state: {
    isRecording: boolean;
    isPaused: boolean;
    time: string;
    audioLabel: string;
    microphoneLevel: number;
    systemAudioLevel: number;
    hasUnsavedRecording: boolean;
  }): void {
    this.api?.updateRecorderState(state);
  }

  async updateShortcuts(shortcuts: DesktopShortcutSettings): Promise<{ ok: boolean; message?: string }> {
    if (!this.api) return { ok: false, message: 'Disponible únicamente en la versión de escritorio.' };
    const result = await this.api.updateShortcuts(shortcuts);
    this.settings$.next({ ...this.settings$.value, shortcuts: result.shortcuts });
    return { ok: result.ok, message: result.message };
  }

  async updateAutoSave(enabled: boolean): Promise<void> {
    if (!this.api) return;
    this.settings$.next(await this.api.updateAutoSave(enabled));
  }

  startRecordingSession(metadata: { mimeType: string; quality: string }): Promise<DesktopRecordingSession | undefined> {
    return this.api?.startRecordingSession(metadata) ?? Promise.resolve(undefined);
  }

  appendRecordingChunk(sessionId: string, chunk: ArrayBuffer): Promise<{ bytesWritten: number }> {
    if (!this.api) return Promise.reject(new Error('La integración de escritorio no está disponible.'));
    return this.api.appendRecordingChunk(sessionId, chunk);
  }

  async finishRecordingSession(sessionId: string, metadata: {
    name: string;
    duration: string;
    resolution: string;
    frameRate: string;
    audio: string;
  }): Promise<DesktopRecordingEntry | undefined> {
    if (!this.api) return undefined;
    const result = await this.api.finishRecordingSession(sessionId, metadata);
    await this.refreshHistory();
    return result.entry;
  }

  abandonRecordingSession(sessionId: string): Promise<void> {
    return this.api?.abandonRecordingSession(sessionId) ?? Promise.resolve();
  }

  async saveRecording(id: string, fileName: string): Promise<DesktopRecordingEntry | undefined> {
    if (!this.api) return undefined;
    const result = await this.api.saveRecording({ id, fileName });
    if (result.entry) await this.refreshHistory();
    return result.entry;
  }

  async refreshHistory(): Promise<void> {
    if (!this.api) return;
    this.history$.next(await this.api.listHistory());
  }

  openRecording(id: string): Promise<string | undefined> {
    return this.api?.openRecording(id) ?? Promise.resolve(undefined);
  }

  showRecordingInFolder(id: string): Promise<void> {
    return this.api?.showRecordingInFolder(id) ?? Promise.resolve();
  }

  async removeHistoryEntry(id: string, deleteFile: boolean): Promise<void> {
    if (!this.api) return;
    this.history$.next(await this.api.removeHistoryEntry({ id, deleteFile }));
  }

  openMediaSettings(): Promise<void> {
    return this.api?.openMediaSettings() ?? Promise.resolve();
  }

  async checkForUpdates(): Promise<void> {
    if (!this.api) return;
    this.updateState$.next(await this.api.checkForUpdates());
  }

  async downloadUpdate(): Promise<void> {
    if (!this.api) return;
    this.updateState$.next(await this.api.downloadUpdate());
  }

  installUpdate(): Promise<void> {
    return this.api?.installUpdate() ?? Promise.resolve();
  }
}
