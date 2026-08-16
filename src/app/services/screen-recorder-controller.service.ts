import { Injectable, Renderer2 } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { RecordingOptions, ScreenRecorderService } from './screen-recorder.service';
import { NotificationService } from './notification.service';

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

  constructor(
    private recorderService: ScreenRecorderService,
    private notificationService: NotificationService
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
      this.cleanupMedia = media.cleanup;
      this.previewElement = videoElement;
      this.updateCaptureDetails(media);

      if ((options.includeMicrophone || options.includeSystemAudio) && stream.getAudioTracks().length === 0) {
        this.notificationService.warning('La grabación continuará sin audio porque no se detectó ninguna fuente.');
      }

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
      this.startMediaRecording(options, videoElement, stream);
    }, 1000);
  }

  private startMediaRecording(
    options: RecordingOptions,
    videoElement: HTMLVideoElement,
    stream: MediaStream
  ) {
    try {
      const mimeType = this.getSupportedMimeType();
      this.mediaRecorder = new MediaRecorder(stream, {
        ...(mimeType ? { mimeType } : {}),
        videoBitsPerSecond: options.quality === '1080p' ? 5_000_000 : 3_000_000,
        ...(stream.getAudioTracks().length > 0 ? { audioBitsPerSecond: 192_000 } : {})
      });

      this.recordedChunks = [];

      this.mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          this.recordedChunks.push(e.data);
        }
      };

      this.mediaRecorder.onstop = () => {
        this.stopTimer();
        this.cleanupMedia?.();
        this.cleanupMedia = undefined;
        videoElement.srcObject = null;
        this.previewElement = undefined;

        const blob = new Blob(this.recordedChunks, { type: mimeType || 'video/webm' });
        const url = URL.createObjectURL(blob);
        this.previewUrl$.next(url);

        const date = new Date();
        this.recordingDate$.next(date);
        this.recordingSize$.next(this.formatFileSize(blob.size));
        this.recordingFileName = `grabacion-${date.toISOString().replace(/[:.]/g, '-')}`;
        this.recordingFileName$.next(this.recordingFileName);
        this.showFinalVideo$.next(true);
      };

      this.mediaRecorder.start();
      this.isRecording$.next(true);
      this.isPaused$.next(false);
      this.startTimer();
      this.notificationService.success('Grabación iniciada correctamente.');

    } catch (error: unknown) {
      this.handleStartError(error);
      this.cleanupMedia?.();
      this.cleanupMedia = undefined;
      videoElement.srcObject = null;
      this.previewElement = undefined;
    }
  }

  private handleStartError(error: unknown) {
    const err = error as DOMException;
    if (err.name === 'NotAllowedError') {
      this.notificationService.error('Permiso denegado para acceder a la pantalla o al micrófono.');
    } else if (err.name === 'NotFoundError') {
      this.notificationService.error('No se encontró una pantalla o un micrófono disponible.');
    } else if (err.name === 'InvalidStateError') {
      this.notificationService.error('Inicia la grabación directamente desde el botón de la aplicación.');
    } else {
      this.notificationService.error(`No fue posible iniciar la grabación: ${err.message || 'error desconocido'}`);
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
      this.notificationService.success('Grabación lista para revisar y descargar.');
    }
  }

  download(renderer: Renderer2) {
    const url = this.previewUrl$.value;
    if (!url) return;

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

  reset() {
    this.cancelCountdown();
    this.cleanupMedia?.();
    this.cleanupMedia = undefined;
    this.releasePreviewUrl();
    this.previewUrl$.next(null);
    this.isRecording$.next(false);
    this.isPaused$.next(false);
    this.showFinalVideo$.next(false);
    this.recordingSize$.next('0 MB');
    this.recordingDate$.next(null);
    this.recordingFileName = 'grabacion';
    this.recordingFileName$.next(this.recordingFileName);
    this.captureResolution$.next('Pendiente');
    this.captureFrameRate$.next('30 FPS objetivo');
    this.capturedAudio$.next('Sin verificar');
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
  private releasePreviewUrl() {
    const currentUrl = this.previewUrl$.value;
    if (currentUrl) URL.revokeObjectURL(currentUrl);
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
    if (bytes < 1_000_000) return `${(bytes / 1_000).toFixed(0)} KB`;
    return `${(bytes / 1_000_000).toFixed(1)} MB`;
  }
}
