import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, HostListener, OnDestroy, OnInit, Renderer2 } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DesktopDownload, DesktopDownloadService } from '@services/desktop-download.service';
import { DesktopIntegrationService } from '@services/desktop-integration.service';
import { NotificationService } from '@services/notification.service';
import { RecorderIssue, ScreenRecorderControllerService } from '@services/screen-recorder-controller.service';
import { combineLatest, distinctUntilChanged, map, Observable, shareReplay, Subscription } from 'rxjs';

@Component({
  selector: 'app-screen-recorder',
  standalone: true,
  imports: [CommonModule, FormsModule,],
  templateUrl: './screen-recorder.component.html',
  styleUrl: './screen-recorder.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ScreenRecorderComponent implements OnInit, OnDestroy {
  selectedQuality: '720p' | '1080p' = '1080p';
  includeMicrophone = true;
  includeSystemAudio = true;
  selectedMicrophoneId = '';
  microphones: MediaDeviceInfo[] = [];
  showAbout = false;
  showDownload = false;
  isSettingsOpen = true;
  shortcutDraft: DesktopShortcutSettings = {
    toggle: 'CommandOrControl+Shift+R',
    pause: 'CommandOrControl+Shift+P',
    stop: 'CommandOrControl+Shift+X'
  };
  readonly isDesktopMode = typeof navigator !== 'undefined' && /Electron\//.test(navigator.userAgent);
  readonly isBrowserSupported = typeof navigator !== 'undefined'
    && !!navigator.mediaDevices?.getDisplayMedia
    && typeof MediaRecorder !== 'undefined';

  isRecording$!: Observable<boolean>;
  isPaused$!: Observable<boolean>;
  isPreparing$!: Observable<boolean>;
  isCountingDown$!: Observable<boolean>;
  countdown$!: Observable<number>;
  recordingTime$!: Observable<string>;
  previewUrl$!: Observable<string | null>;
  showFinalVideo$!: Observable<boolean>;
  recordingSize$!: Observable<string>;
  recordingDate$!: Observable<Date | null>;
  recordingFileName$!: Observable<string>;
  captureResolution$!: Observable<string>;
  captureFrameRate$!: Observable<string>;
  capturedAudio$!: Observable<string>;
  microphoneCaptureLevel$!: Observable<number>;
  systemAudioLevel$!: Observable<number>;
  recorderIssue$!: Observable<RecorderIssue | null>;
  savedRecording$!: Observable<DesktopRecordingEntry | null>;
  /** La sesión ocupa el estudio completo: preparando, contando, grabando o revisando. */
  isStudioBusy$!: Observable<boolean>;
  readonly history$: Observable<DesktopRecordingEntry[]>;
  readonly appInfo$: Observable<DesktopAppInfo>;
  readonly updateState$: Observable<DesktopUpdateState>;
  readonly desktopDownload$: Observable<DesktopDownload | null>;

  isTestingMicrophone = false;
  microphoneLevel = 0;
  microphoneName = 'Micrófono sin verificar';
  private microphoneTestStream?: MediaStream;
  private microphoneTestContext?: AudioContext;
  private microphoneAnimationFrame?: number;
  private isDestroyed = false;
  private readonly subscriptions = new Subscription();
  private removeDesktopCommandListener?: () => void;
  private readonly handleDeviceChange = () => {
    void this.loadMicrophones();
  };

  constructor(
    private controller: ScreenRecorderControllerService,
    private renderer: Renderer2,
    private cdr: ChangeDetectorRef,
    private notificationService: NotificationService,
    readonly desktopIntegration: DesktopIntegrationService,
    desktopDownload: DesktopDownloadService
  ) {
    this.history$ = desktopIntegration.history$;
    this.appInfo$ = desktopIntegration.appInfo$;
    this.updateState$ = desktopIntegration.updateState$;
    this.desktopDownload$ = desktopDownload.download$;
  }

  ngOnInit(): void {
    this.isRecording$ = this.controller.isRecording$;
    this.isPaused$ = this.controller.isPaused$;
    this.isPreparing$ = this.controller.isPreparing$;
    this.isCountingDown$ = this.controller.isCountingDown$;
    this.countdown$ = this.controller.countdown$;
    this.recordingTime$ = this.controller.recordingTime$;
    this.previewUrl$ = this.controller.previewUrl$;
    this.showFinalVideo$ = this.controller.showFinalVideo$;
    this.recordingSize$ = this.controller.recordingSize$;
    this.recordingDate$ = this.controller.recordingDate$;
    this.recordingFileName$ = this.controller.recordingFileName$;
    this.captureResolution$ = this.controller.captureResolution$;
    this.captureFrameRate$ = this.controller.captureFrameRate$;
    this.capturedAudio$ = this.controller.capturedAudio$;
    this.microphoneCaptureLevel$ = this.controller.microphoneLevel$;
    this.systemAudioLevel$ = this.controller.systemAudioLevel$;
    this.recorderIssue$ = this.controller.recorderIssue$;
    this.savedRecording$ = this.controller.savedRecording$;
    this.isStudioBusy$ = combineLatest([
      this.controller.isRecording$,
      this.controller.isPreparing$,
      this.controller.isCountingDown$,
      this.controller.showFinalVideo$
    ]).pipe(
      map(states => states.some(Boolean)),
      distinctUntilChanged(),
      shareReplay({ bufferSize: 1, refCount: true })
    );

    this.restorePreferences();
    void this.loadMicrophones();
    navigator.mediaDevices?.addEventListener?.('devicechange', this.handleDeviceChange);

    this.subscriptions.add(this.desktopIntegration.settings$.subscribe(settings => {
      this.shortcutDraft = { ...settings.shortcuts };
      this.cdr.markForCheck();
    }));
    this.subscriptions.add(combineLatest([
      this.controller.isRecording$,
      this.controller.isPaused$,
      this.controller.recordingTime$,
      this.controller.capturedAudio$,
      this.controller.microphoneLevel$,
      this.controller.systemAudioLevel$,
      this.controller.showFinalVideo$,
      this.controller.savedRecording$
    ]).subscribe(([isRecording, isPaused, time, audioLabel, microphoneLevel, systemAudioLevel, showFinalVideo, savedRecording]) => {
      this.desktopIntegration.updateRecorderState({
        isRecording,
        isPaused,
        time,
        audioLabel,
        microphoneLevel,
        systemAudioLevel,
        hasUnsavedRecording: showFinalVideo && !savedRecording?.saved
      });
    }));
    this.removeDesktopCommandListener = this.desktopIntegration.onRecorderCommand(command => {
      if (command === 'toggle-recording') {
        if (this.controller.isRecording$.value) this.stopRecording();
        else this.startRecording();
      } else if (command === 'pause') {
        this.pauseRecording();
      } else if (command === 'resume') {
        this.resumeRecording();
      } else if (command === 'stop') {
        this.stopRecording();
      }
    });
  }

  ngOnDestroy(): void {
    this.isDestroyed = true;
    this.stopMicrophoneTest();
    navigator.mediaDevices?.removeEventListener?.('devicechange', this.handleDeviceChange);
    this.removeDesktopCommandListener?.();
    this.subscriptions.unsubscribe();
  }

  @HostListener('window:beforeunload', ['$event'])
  protectUnsavedRecording(event: BeforeUnloadEvent) {
    if (this.desktopIntegration.isDesktop) return;
    if (!this.controller.hasUnsavedRecording() && !this.controller.isRecording$.value) return;
    event.preventDefault();
    event.returnValue = '';
  }

  @HostListener('document:keydown.escape')
  closePreferences() {
    this.showAbout = false;
    this.showDownload = false;
  }

  toggleDownload() {
    this.showDownload = !this.showDownload;
  }

  /** Resumen que reemplaza al detalle cuando el menú está plegado. */
  get audioSummary(): string {
    if (this.includeMicrophone && this.includeSystemAudio) return 'Micrófono + sistema';
    if (this.includeMicrophone) return 'Micrófono';
    if (this.includeSystemAudio) return 'Sistema';
    return 'Sin audio';
  }

  toggleSettings() {
    this.isSettingsOpen = !this.isSettingsOpen;
    this.persistPreferences();
  }

  startRecording() {
    this.stopMicrophoneTest();
    const video = this.renderer.selectRootElement('#preview', true) as HTMLVideoElement;
    void this.controller.startRecording({
      quality: this.selectedQuality,
      includeMicrophone: this.includeMicrophone,
      includeSystemAudio: this.includeSystemAudio,
      allowSimultaneousAudio: true,
      microphoneDeviceId: this.selectedMicrophoneId || undefined
    }, video);
  }

  setQuality(quality: '720p' | '1080p') {
    this.selectedQuality = quality;
    this.persistPreferences();
  }

  setMicrophone(enabled: boolean) {
    this.includeMicrophone = enabled;
    if (!enabled) this.stopMicrophoneTest();
    this.persistPreferences();
  }

  setSystemAudio(enabled: boolean) {
    this.includeSystemAudio = enabled;
    this.persistPreferences();
  }

  setMicrophoneDevice(deviceId: string) {
    this.selectedMicrophoneId = deviceId;
    this.microphoneName = this.microphones.find(device => device.deviceId === deviceId)?.label || 'Micrófono predeterminado';
    if (this.isTestingMicrophone) this.stopMicrophoneTest();
    this.persistPreferences();
  }

  async toggleMicrophoneTest() {
    if (this.isTestingMicrophone) {
      this.stopMicrophoneTest();
      return;
    }

    try {
      this.microphoneTestStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          ...(this.selectedMicrophoneId ? { deviceId: { exact: this.selectedMicrophoneId } } : {}),
          echoCancellation: { exact: true },
          noiseSuppression: { ideal: true },
          autoGainControl: { ideal: true },
          channelCount: { ideal: 1 }
        }
      });
      if (this.isDestroyed) {
        this.microphoneTestStream.getTracks().forEach(track => track.stop());
        this.microphoneTestStream = undefined;
        return;
      }
      const track = this.microphoneTestStream.getAudioTracks()[0];
      this.microphoneName = track?.label || 'Micrófono predeterminado';
      await this.loadMicrophones();
      this.microphoneTestContext = new AudioContext({ latencyHint: 'interactive' });
      const analyser = this.microphoneTestContext.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.75;
      this.microphoneTestContext.createMediaStreamSource(this.microphoneTestStream).connect(analyser);

      const samples = new Uint8Array(analyser.fftSize);
      this.isTestingMicrophone = true;

      const updateLevel = () => {
        analyser.getByteTimeDomainData(samples);
        const meanSquare = samples.reduce((sum, value) => {
          const normalized = (value - 128) / 128;
          return sum + normalized * normalized;
        }, 0) / samples.length;
        this.microphoneLevel = Math.min(100, Math.round(Math.sqrt(meanSquare) * 280));
        this.cdr.markForCheck();
        this.microphoneAnimationFrame = requestAnimationFrame(updateLevel);
      };
      updateLevel();
      this.cdr.markForCheck();
    } catch (error) {
      console.error('No fue posible probar el micrófono:', error);
      this.stopMicrophoneTest();
      this.notificationService.error('No se pudo acceder al micrófono para realizar la prueba.');
    }
  }

  stopMicrophoneTest() {
    if (this.microphoneAnimationFrame !== undefined) cancelAnimationFrame(this.microphoneAnimationFrame);
    this.microphoneAnimationFrame = undefined;
    this.microphoneTestStream?.getTracks().forEach(track => track.stop());
    this.microphoneTestStream = undefined;
    if (this.microphoneTestContext && this.microphoneTestContext.state !== 'closed') {
      void this.microphoneTestContext.close();
    }
    this.microphoneTestContext = undefined;
    this.isTestingMicrophone = false;
    this.microphoneLevel = 0;
    this.cdr.markForCheck();
  }

  cancelCountdown() {
    this.controller.cancelCountdown();
  }

  pauseRecording() {
    this.controller.pause();
  }

  resumeRecording() {
    this.controller.resume();
  }

  stopRecording() {
    this.controller.stop();
  }

  reset() {
    this.controller.reset();
  }

  downloadRecording() {
    void this.controller.download(this.renderer);
  }

  renameRecording(value: string) {
    this.controller.updateRecordingFileName(value);
  }

  handleIssueAction(issue: RecorderIssue) {
    if (issue.action === 'settings') {
      void this.controller.openMediaSettings();
      return;
    }
    this.controller.dismissIssue();
    if (issue.action === 'retry') this.startRecording();
  }

  openSavedFolder() {
    void this.controller.openSavedRecordingFolder();
  }

  async saveShortcuts() {
    const result = await this.desktopIntegration.updateShortcuts(this.shortcutDraft);
    if (result.ok) {
      this.notificationService.success('Atajos actualizados.');
    } else {
      this.notificationService.error(result.message || 'No fue posible actualizar los atajos.');
    }
  }

  async setAutoSave(enabled: boolean) {
    try {
      await this.desktopIntegration.updateAutoSave(enabled);
      this.notificationService.success(enabled
        ? 'Guardado automático activado.'
        : 'Guardado automático desactivado.');
    } catch (error) {
      console.error('No fue posible actualizar el guardado automático:', error);
      this.notificationService.error('No fue posible actualizar el guardado automático.');
    }
  }

  openHistoryRecording(id: string) {
    void this.desktopIntegration.openRecording(id).catch(error => {
      console.error('No fue posible abrir la grabación:', error);
      this.notificationService.error('No fue posible abrir la grabación.');
    });
  }

  showHistoryRecording(id: string) {
    void this.desktopIntegration.showRecordingInFolder(id);
  }

  removeHistoryEntry(id: string, deleteFile: boolean) {
    if (deleteFile && !window.confirm('El archivo se moverá a la Papelera. ¿Deseas continuar?')) return;
    void this.desktopIntegration.removeHistoryEntry(id, deleteFile).then(() => {
      this.notificationService.success(deleteFile ? 'Archivo movido a la Papelera.' : 'Entrada eliminada del historial.');
    }).catch(error => {
      console.error('No fue posible actualizar el historial:', error);
      this.notificationService.error('No fue posible actualizar el historial.');
    });
  }

  checkForUpdates() {
    void this.desktopIntegration.checkForUpdates();
  }

  downloadUpdate() {
    void this.desktopIntegration.downloadUpdate();
  }

  installUpdate() {
    void this.desktopIntegration.installUpdate();
  }

  formatHistorySize(bytes: number): string {
    if (bytes < 1_000) return `${bytes} B`;
    if (bytes < 1_000_000) return `${Math.round(bytes / 1_000)} KB`;
    return `${(bytes / 1_000_000).toFixed(1)} MB`;
  }

  private restorePreferences() {
    try {
      const stored = localStorage.getItem('cleanrecord.preferences');
      if (!stored) return;
      const preferences = JSON.parse(stored) as Partial<{
        quality: '720p' | '1080p';
        includeMicrophone: boolean;
        includeSystemAudio: boolean;
        microphoneDeviceId: string;
        settingsOpen: boolean;
      }>;
      if (preferences.quality === '720p' || preferences.quality === '1080p') this.selectedQuality = preferences.quality;
      if (typeof preferences.includeMicrophone === 'boolean') this.includeMicrophone = preferences.includeMicrophone;
      if (typeof preferences.includeSystemAudio === 'boolean') this.includeSystemAudio = preferences.includeSystemAudio;
      if (typeof preferences.microphoneDeviceId === 'string') this.selectedMicrophoneId = preferences.microphoneDeviceId;
      if (typeof preferences.settingsOpen === 'boolean') this.isSettingsOpen = preferences.settingsOpen;
    } catch (error) {
      console.warn('No fue posible restaurar las preferencias:', error);
    }
  }

  private persistPreferences() {
    localStorage.setItem('cleanrecord.preferences', JSON.stringify({
      quality: this.selectedQuality,
      includeMicrophone: this.includeMicrophone,
      includeSystemAudio: this.includeSystemAudio,
      microphoneDeviceId: this.selectedMicrophoneId,
      settingsOpen: this.isSettingsOpen
    }));
  }

  private async loadMicrophones() {
    if (!navigator.mediaDevices?.enumerateDevices) return;
    try {
      this.microphones = (await navigator.mediaDevices.enumerateDevices())
        .filter(device => device.kind === 'audioinput');
      if (this.selectedMicrophoneId && !this.microphones.some(device => device.deviceId === this.selectedMicrophoneId)) {
        this.selectedMicrophoneId = '';
        this.persistPreferences();
      }
      const selected = this.microphones.find(device => device.deviceId === this.selectedMicrophoneId);
      this.microphoneName = selected?.label || this.microphones[0]?.label || 'Micrófono predeterminado';
      this.cdr.markForCheck();
    } catch (error) {
      console.warn('No fue posible enumerar los micrófonos:', error);
    }
  }
}
