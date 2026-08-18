import { Injectable, Renderer2 } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { RecordingOptions, ScreenRecorderService } from './screen-recorder.service';
import { NotificationService } from './notification.service';
import { DesktopIntegrationService } from './desktop-integration.service';

export interface RecorderIssue {
  title: string;
  message: string;
  action: 'retry' | 'settings' | 'dismiss';
}

@Injectable({ providedIn: 'root' })
export class ScreenRecorderControllerService {
  private mediaRecorder!: MediaRecorder;
  private recordedChunks: Blob[] = [];
  private timerInterval?: ReturnType<typeof setInterval>;
  private countdownInterval?: ReturnType<typeof setInterval>;
  private startTime!: number;
  private pausedAt?: number;
  private pausedDuration = 0;
  private cleanupMedia?: () => void;
  private previewElement?: HTMLVideoElement;
  private captureAttempt = 0;
  private recordingFileName = 'grabacion';
  private audioLevelInterval?: ReturnType<typeof setInterval>;
  private desktopSessionId?: string;
  private desktopEntryId?: string;
  private desktopChunkChain: Promise<void> = Promise.resolve();
  private audioLevels?: { microphone: () => number; system: () => number };

  isRecording$ = new BehaviorSubject(false);
  isPaused$ = new BehaviorSubject(false);
  isPreparing$ = new BehaviorSubject(false);
  isCountingDown$ = new BehaviorSubject(false);
  countdown$ = new BehaviorSubject(0);
  recordingTime$ = new BehaviorSubject('00:00');
  showFinalVideo$ = new BehaviorSubject(false);
  previewUrl$ = new BehaviorSubject<string | null>(null);
  recordingSize$ = new BehaviorSubject('0 MB');
  recordingDate$ = new BehaviorSubject<Date | null>(null);
  recordingFileName$ = new BehaviorSubject('grabacion');
  captureResolution$ = new BehaviorSubject('Pendiente');
  captureFrameRate$ = new BehaviorSubject('30 FPS objetivo');
  capturedAudio$ = new BehaviorSubject('Sin verificar');
  microphoneLevel$ = new BehaviorSubject(0);
  systemAudioLevel$ = new BehaviorSubject(0);
  recorderIssue$ = new BehaviorSubject<RecorderIssue | null>(null);
  savedRecording$ = new BehaviorSubject<DesktopRecordingEntry | null>(null);

  constructor(
    private recorderService: ScreenRecorderService,
    private notificationService: NotificationService,
    private desktopIntegration: DesktopIntegrationService
  ) { }

  startTimer() {
    this.startTime = Date.now();
    this.pausedDuration = 0;
    this.pausedAt = undefined;
    this.timerInterval = setInterval(() => {
      if (this.isPaused$.value) return;
      const elapsed = Math.floor((Date.now() - this.startTime - this.pausedDuration) / 1000);
      const min = Math.floor(elapsed / 60).toString().padStart(2, '0');
      const sec = (elapsed % 60).toString().padStart(2, '0');
      this.recordingTime$.next(`${min}:${sec}`);
    }, 1000);
  }

  stopTimer(reset = false) {
    if (this.timerInterval) clearInterval(this.timerInterval);
    this.timerInterval = undefined;
    if (reset) this.recordingTime$.next('00:00');
  }

  async startRecording(options: RecordingOptions, videoElement: HTMLVideoElement) {
    if (this.isRecording$.value || this.isPreparing$.value || this.isCountingDown$.value) return;
    if (!navigator.mediaDevices?.getDisplayMedia || typeof MediaRecorder === 'undefined') {
      this.notificationService.error('Este entorno no soporta la grabación de pantalla.');
      return;
    }

    const attempt = ++this.captureAttempt;
    this.releasePreviewUrl();
    this.previewUrl$.next(null);
    this.showFinalVideo$.next(false);
    this.recordingSize$.next('0 MB');
    this.recordingDate$.next(null);
    this.savedRecording$.next(null);
    this.desktopEntryId = undefined;
    this.recorderIssue$.next(null);
    this.captureResolution$.next('Detectando…');
    this.captureFrameRate$.next('Detectando…');
    this.capturedAudio$.next('Verificando…');
    this.countdown$.next(3);
    this.isPreparing$.next(true);
    this.isCountingDown$.next(false);

    try {
      // getDisplayMedia se invoca dentro del gesto del usuario. En navegador esto
      // permite mostrar el selector antes de la cuenta regresiva; Electron lo resuelve
      // automáticamente con el monitor principal.
      const media = await this.recorderService.getCombinedStream(options);
      if (attempt !== this.captureAttempt || !this.isPreparing$.value) {
        media.cleanup();
        return;
      }

      const stream = media.stream;
      this.cleanupMedia = () => {
        this.stopAudioMonitoring();
        media.cleanup();
      };
      this.previewElement = videoElement;
      this.updateCaptureDetails(media);
      this.startAudioMonitoring(media.audioLevels);

      this.reportAudioGaps(options, media, stream);

      // La vista previa es únicamente visual. Forzar silencio por propiedad evita
      // realimentar el micrófono incluso si el atributo HTML se rehidrata o cambia.
      videoElement.muted = true;
      videoElement.volume = 0;
      videoElement.srcObject = stream;
      await videoElement.play();

      if (attempt !== this.captureAttempt || !this.isPreparing$.value) {
        media.cleanup();
        videoElement.srcObject = null;
        return;
      }

      stream.getVideoTracks()[0]?.addEventListener('ended', () => {
        if (this.isRecording$.value) {
          this.stop();
        } else if ((this.isPreparing$.value || this.isCountingDown$.value) && attempt === this.captureAttempt) {
          this.cancelCountdown();
          this.notificationService.info('La captura de pantalla se detuvo antes de iniciar la grabación.');
        }
      }, { once: true });

      this.isPreparing$.next(false);
      this.isCountingDown$.next(true);
      this.beginCountdown(options, videoElement, stream);
    } catch (error: unknown) {
      if (attempt !== this.captureAttempt) return;
      this.isPreparing$.next(false);
      this.isCountingDown$.next(false);
      this.countdown$.next(0);
      this.handleStartError(error);
      this.cleanupMedia?.();
      this.cleanupMedia = undefined;
      this.previewElement = undefined;
    }
  }

  cancelCountdown() {
    this.captureAttempt++;
    if (this.countdownInterval) clearInterval(this.countdownInterval);
    this.countdownInterval = undefined;
    this.isPreparing$.next(false);
    this.isCountingDown$.next(false);
    this.countdown$.next(0);
    this.cleanupMedia?.();
    this.cleanupMedia = undefined;
    if (this.previewElement) this.previewElement.srcObject = null;
    this.previewElement = undefined;
  }

  private beginCountdown(options: RecordingOptions, videoElement: HTMLVideoElement, stream: MediaStream) {
    this.countdownInterval = setInterval(() => {
      const value = this.countdown$.value - 1;
      this.countdown$.next(value);
      if (value > 0) return;

      if (this.countdownInterval) clearInterval(this.countdownInterval);
      this.countdownInterval = undefined;
      this.isCountingDown$.next(false);
      void this.startMediaRecording(options, videoElement, stream);
    }, 1000);
  }

  private async startMediaRecording(
    options: RecordingOptions,
    videoElement: HTMLVideoElement,
    stream: MediaStream
  ): Promise<void> {
    try {
      this.isPreparing$.next(true);
      const mimeType = this.getSupportedMimeType();
      const desktopSession = await this.desktopIntegration.startRecordingSession({
        mimeType: mimeType || 'video/webm',
        quality: options.quality
      });
      this.desktopSessionId = desktopSession?.sessionId;
      this.desktopChunkChain = Promise.resolve();
      this.mediaRecorder = new MediaRecorder(stream, {
        ...(mimeType ? { mimeType } : {}),
        videoBitsPerSecond: options.quality === '1080p' ? 5_000_000 : 3_000_000,
        ...(stream.getAudioTracks().length > 0 ? { audioBitsPerSecond: 192_000 } : {})
      });

      this.recordedChunks = [];

      this.mediaRecorder.ondataavailable = (e) => {
        if (e.data.size === 0) return;
        if (this.desktopSessionId) {
          const sessionId = this.desktopSessionId;
          this.desktopChunkChain = this.desktopChunkChain.then(async () => {
            const chunk = await e.data.arrayBuffer();
            const result = await this.desktopIntegration.appendRecordingChunk(sessionId, chunk);
            this.recordingSize$.next(this.formatFileSize(result.bytesWritten));
          });
          void this.desktopChunkChain.catch(error => {
            console.error('No fue posible escribir un fragmento de la grabación:', error);
            this.recorderIssue$.next({
              title: 'Problema al guardar la grabación',
              message: 'No se pudo escribir un fragmento. Detén la captura para intentar recuperar lo guardado.',
              action: 'dismiss'
            });
          });
        } else {
          this.recordedChunks.push(e.data);
        }
      };

      this.mediaRecorder.onstop = () => {
        void this.finalizeRecording(videoElement, mimeType);
      };

      this.mediaRecorder.start(1000);
      this.isPreparing$.next(false);
      this.isRecording$.next(true);
      this.isPaused$.next(false);
      this.startTimer();
      this.notificationService.success('Grabación iniciada correctamente.');

    } catch (error: unknown) {
      this.isPreparing$.next(false);
      this.handleStartError(error);
      if (this.desktopSessionId) {
        void this.desktopIntegration.abandonRecordingSession(this.desktopSessionId);
        this.desktopSessionId = undefined;
      }
      this.cleanupMedia?.();
      this.cleanupMedia = undefined;
      videoElement.srcObject = null;
      this.previewElement = undefined;
    }
  }

  private async finalizeRecording(videoElement: HTMLVideoElement, mimeType: string): Promise<void> {
    this.stopTimer();
    this.cleanupMedia?.();
    this.cleanupMedia = undefined;
    videoElement.srcObject = null;
    this.previewElement = undefined;

    const date = new Date();
    this.recordingDate$.next(date);
    this.recordingFileName = `grabacion-${date.toISOString().replace(/[:.]/g, '-')}`;
    this.recordingFileName$.next(this.recordingFileName);

    try {
      if (this.desktopSessionId) {
        const sessionId = this.desktopSessionId;
        await this.desktopChunkChain;
        const entry = await this.desktopIntegration.finishRecordingSession(sessionId, {
          name: this.recordingFileName,
          duration: this.recordingTime$.value,
          resolution: this.captureResolution$.value,
          frameRate: this.captureFrameRate$.value,
          audio: this.capturedAudio$.value
        });
        this.desktopSessionId = undefined;
        if (!entry) throw new Error('No fue posible registrar el archivo de escritorio.');
        this.desktopEntryId = entry.id;
        this.savedRecording$.next(entry);
        this.previewUrl$.next(entry.previewUrl);
        this.recordingSize$.next(this.formatFileSize(entry.size));
      } else {
        const blob = new Blob(this.recordedChunks, { type: mimeType || 'video/webm' });
        this.previewUrl$.next(URL.createObjectURL(blob));
        this.recordingSize$.next(this.formatFileSize(blob.size));
      }
      this.showFinalVideo$.next(true);
      this.notificationService.success('Grabación lista para revisar y guardar.');
    } catch (error) {
      console.error('No fue posible finalizar la grabación:', error);
      if (this.desktopSessionId) {
        await this.desktopIntegration.abandonRecordingSession(this.desktopSessionId);
        this.desktopSessionId = undefined;
      }
      this.recorderIssue$.next({
        title: 'La grabación necesita recuperación',
        message: 'No se pudo cerrar normalmente, pero los fragmentos guardados permanecen en el historial de recuperación.',
        action: 'dismiss'
      });
      this.notificationService.error('No se pudo finalizar normalmente. Revisa el historial de recuperación.');
      await this.desktopIntegration.refreshHistory();
    }
  }

  // El audio nunca detiene una captura ya iniciada: la pantalla se sigue grabando y el
  // problema se informa sin bloquear.
  private reportAudioGaps(
    options: RecordingOptions,
    media: Awaited<ReturnType<ScreenRecorderService['getCombinedStream']>>,
    stream: MediaStream
  ): void {
    const wantedAudio = options.includeMicrophone || options.includeSystemAudio;
    if (!wantedAudio || stream.getAudioTracks().length > 0) {
      if (media.details.microphoneError) {
        this.notificationService.warning('El micrófono no está disponible. La grabación continúa con el audio del sistema.');
      }
      return;
    }

    const message = media.details.microphoneError === 'denied'
      ? 'El sistema no autorizó el micrófono. Puedes continuar sin audio o revisar sus permisos.'
      : media.details.microphoneError === 'missing'
        ? 'No hay un micrófono conectado. Puedes continuar sin audio o seleccionar otro dispositivo.'
        : 'Puedes continuar sin audio o revisar los permisos y dispositivos del sistema.';

    this.notificationService.warning('La grabación continuará sin audio porque no se detectó ninguna fuente.');
    this.recorderIssue$.next({
      title: 'No se detectó señal de audio',
      message,
      action: this.desktopIntegration.isDesktop ? 'settings' : 'dismiss'
    });
  }

  private handleStartError(error: unknown) {
    const err = error as DOMException;
    // El micrófono ya no interrumpe el inicio, así que estos errores describen la captura
    // de pantalla.
    if (err.name === 'NotAllowedError') {
      this.notificationService.error('No se autorizó la captura de pantalla.');
      this.recorderIssue$.next({
        title: 'Captura de pantalla no autorizada',
        message: 'La captura del monitor fue rechazada. Vuelve a intentarlo.',
        action: 'retry'
      });
    } else if (err.name === 'NotFoundError') {
      this.notificationService.error('No se encontró una pantalla disponible para capturar.');
      this.recorderIssue$.next({
        title: 'Pantalla no disponible',
        message: 'No hay un monitor disponible para capturar. Verifica la pantalla y vuelve a iniciar la captura.',
        action: 'retry'
      });
    } else if (err.name === 'InvalidStateError') {
      this.notificationService.error('Inicia la grabación directamente desde el botón de la aplicación.');
      this.recorderIssue$.next({
        title: 'La captura necesita una acción directa',
        message: 'Vuelve a utilizar el botón Iniciar grabación.',
        action: 'retry'
      });
    } else {
      this.notificationService.error(`No fue posible iniciar la grabación: ${err.message || 'error desconocido'}`);
      this.recorderIssue$.next({
        title: 'No se pudo iniciar la grabación',
        message: err.message || 'Ocurrió un error inesperado al preparar la captura.',
        action: 'retry'
      });
    }
    console.error('Error al iniciar la grabación:', err);
  }

  pause() {
    if (this.mediaRecorder && this.isRecording$.value && !this.isPaused$.value) {
      this.mediaRecorder.pause();
      this.isPaused$.next(true);
      this.pausedAt = Date.now();
      this.notificationService.info('Grabación pausada.');
    }
  }

  resume() {
    if (this.mediaRecorder && this.isRecording$.value && this.isPaused$.value) {
      this.mediaRecorder.resume();
      if (this.pausedAt) this.pausedDuration += Date.now() - this.pausedAt;
      this.pausedAt = undefined;
      this.isPaused$.next(false);
      this.notificationService.info('Grabación reanudada.');
    }
  }

  stop() {
    if (this.mediaRecorder && this.isRecording$.value) {
      this.mediaRecorder.stop();
      this.isRecording$.next(false);
      this.isPaused$.next(false);
      this.notificationService.info('Finalizando y verificando la grabación…');
    }
  }

  async download(renderer: Renderer2): Promise<void> {
    const url = this.previewUrl$.value;
    if (!url) return;

    if (this.desktopEntryId) {
      try {
        const entry = await this.desktopIntegration.saveRecording(this.desktopEntryId, this.recordingFileName);
        if (!entry) return;
        this.savedRecording$.next(entry);
        this.previewUrl$.next(entry.previewUrl);
        this.notificationService.success('Grabación guardada correctamente.');
      } catch (error) {
        console.error('No fue posible guardar la grabación:', error);
        this.notificationService.error('No fue posible guardar el archivo en la ubicación seleccionada.');
      }
      return;
    }

    const link = renderer.createElement('a');
    renderer.setAttribute(link, 'href', url);
    const fileName = this.recordingFileName.toLowerCase().endsWith('.webm')
      ? this.recordingFileName
      : `${this.recordingFileName}.webm`;
    renderer.setAttribute(link, 'download', fileName);
    renderer.setStyle(link, 'display', 'none');
    renderer.appendChild(document.body, link);
    link.click();
    renderer.removeChild(document.body, link);
    this.notificationService.success('Descarga iniciada.');
  }

  async openSavedRecordingFolder(): Promise<void> {
    if (!this.desktopEntryId) return;
    await this.desktopIntegration.showRecordingInFolder(this.desktopEntryId);
  }

  async openMediaSettings(): Promise<void> {
    await this.desktopIntegration.openMediaSettings();
  }

  dismissIssue(): void {
    this.recorderIssue$.next(null);
  }

  hasUnsavedRecording(): boolean {
    return this.showFinalVideo$.value && !this.savedRecording$.value?.saved;
  }

  reset() {
    this.cancelCountdown();
    this.cleanupMedia?.();
    this.cleanupMedia = undefined;
    if (this.desktopSessionId) {
      void this.desktopIntegration.abandonRecordingSession(this.desktopSessionId);
      this.desktopSessionId = undefined;
    }
    this.stopAudioMonitoring();
    this.releasePreviewUrl();
    this.previewUrl$.next(null);
    this.isRecording$.next(false);
    this.isPaused$.next(false);
    this.showFinalVideo$.next(false);
    this.recordingSize$.next('0 MB');
    this.recordingDate$.next(null);
    this.savedRecording$.next(null);
    this.desktopEntryId = undefined;
    this.recordingFileName = 'grabacion';
    this.recordingFileName$.next(this.recordingFileName);
    this.captureResolution$.next('Pendiente');
    this.captureFrameRate$.next('30 FPS objetivo');
    this.capturedAudio$.next('Sin verificar');
    this.recorderIssue$.next(null);
    this.stopTimer(true);
  }

  updateRecordingFileName(value: string) {
    const sanitized = value
      .replace(/[<>:"/\\|?*\u0000-\u001F]/g, '-')
      .trim()
      .replace(/\.webm$/i, '')
      .trim();
    this.recordingFileName = sanitized || 'grabacion';
    this.recordingFileName$.next(this.recordingFileName);
  }

  private updateCaptureDetails(media: Awaited<ReturnType<ScreenRecorderService['getCombinedStream']>>) {
    const { width, height, frameRate, microphoneCaptured, systemAudioCaptured } = media.details;
    this.captureResolution$.next(width && height ? `${width} × ${height}` : 'Resolución del dispositivo');
    this.captureFrameRate$.next(frameRate ? `${Math.round(frameRate)} FPS` : '30 FPS objetivo');

    const audioSources = [
      ...(microphoneCaptured ? ['Micrófono'] : []),
      ...(systemAudioCaptured ? ['Sistema'] : [])
    ];
    this.capturedAudio$.next(audioSources.length > 0 ? audioSources.join(' + ') : 'Sin audio');
  }

  private startAudioMonitoring(levels?: { microphone: () => number; system: () => number }): void {
    this.stopAudioMonitoring();
    this.audioLevels = levels;
    if (!levels) return;
    const update = () => {
      this.microphoneLevel$.next(levels.microphone());
      this.systemAudioLevel$.next(levels.system());
    };
    update();
    this.audioLevelInterval = setInterval(update, 120);
  }

  private stopAudioMonitoring(): void {
    if (this.audioLevelInterval) clearInterval(this.audioLevelInterval);
    this.audioLevelInterval = undefined;
    this.audioLevels = undefined;
    this.microphoneLevel$.next(0);
    this.systemAudioLevel$.next(0);
  }

  private releasePreviewUrl() {
    const currentUrl = this.previewUrl$.value;
    if (currentUrl?.startsWith('blob:')) URL.revokeObjectURL(currentUrl);
  }

  private getSupportedMimeType(): string {
    const candidates = [
      'video/webm;codecs=vp9,opus',
      'video/webm;codecs=vp8,opus',
      'video/webm'
    ];
    return candidates.find(type => MediaRecorder.isTypeSupported(type)) ?? '';
  }

  private formatFileSize(bytes: number): string {
    if (bytes < 1_000) return `${bytes} B`;
    if (bytes < 1_000_000) return `${(bytes / 1_000).toFixed(0)} KB`;
    return `${(bytes / 1_000_000).toFixed(1)} MB`;
  }
}
