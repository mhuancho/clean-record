import { Injectable, Renderer2 } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { ScreenRecorderService } from './screen-recorder.service';
import { NotificationService } from './notification.service';

@Injectable({ providedIn: 'root' })
export class ScreenRecorderControllerService {
  private mediaRecorder!: MediaRecorder;
  private recordedChunks: Blob[] = [];
  private timerInterval: any;
  private startTime!: number;

  isRecording$ = new BehaviorSubject(false);
  isPaused$ = new BehaviorSubject(false);
  isCountingDown$ = new BehaviorSubject(false);
  countdown$ = new BehaviorSubject(0);
  recordingTime$ = new BehaviorSubject('00:00');
  showFinalVideo$ = new BehaviorSubject(false);
  showWatchButton$ = new BehaviorSubject(false);
  previewUrl$ = new BehaviorSubject<string | null>(null);

  constructor(
    private recorderService: ScreenRecorderService,
    private notificationService: NotificationService
  ) { }

  startTimer() {
    this.startTime = Date.now();
    this.timerInterval = setInterval(() => {
      const elapsed = Math.floor((Date.now() - this.startTime) / 1000);
      const min = Math.floor(elapsed / 60).toString().padStart(2, '0');
      const sec = (elapsed % 60).toString().padStart(2, '0');
      this.recordingTime$.next(`${min}:${sec}`);
    }, 1000);
  }

  stopTimer() {
    clearInterval(this.timerInterval);
    this.recordingTime$.next('00:00');
  }

  async startRecording(selectedQuality: '720p' | '1080p', videoElement: HTMLVideoElement, renderer: Renderer2) {
    if (this.isRecording$.value || this.isCountingDown$.value) return;

    this.previewUrl$.next(null);
    this.countdown$.next(3);
    this.isCountingDown$.next(true);

    const countdownInterval = setInterval(() => {
      const value = this.countdown$.value - 1;
      this.countdown$.next(value);
      if (value === 0) {
        clearInterval(countdownInterval);
        this.isCountingDown$.next(false);
        this.iniciarGrabacionReal(selectedQuality, videoElement, renderer);
      }
    }, 1000);
  }

  private async iniciarGrabacionReal(selectedQuality: '720p' | '1080p', videoElement: HTMLVideoElement, renderer: Renderer2) {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
      this.notificationService.error('❌ Tu navegador no soporta grabación de pantalla.');
      this.isCountingDown$.next(false);
      return;
    }
    try {
      const stream = await this.recorderService.getCombinedStream(selectedQuality);

      if (stream.getAudioTracks().length === 0) {
        this.notificationService.info('⚠️ No se detectó audio.');
      }

      videoElement.srcObject = stream;
      await videoElement.play();

      this.mediaRecorder = new MediaRecorder(stream, {
        mimeType: 'video/webm;codecs=vp9',
        videoBitsPerSecond: 5_000_000,
      });

      this.recordedChunks = [];

      this.mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          this.recordedChunks.push(e.data);
        }
      };

      this.mediaRecorder.onstop = () => {
        this.stopTimer();

        const blob = new Blob(this.recordedChunks, { type: 'video/webm' });
        const url = URL.createObjectURL(blob);
        this.previewUrl$.next(url);

        const fecha = new Date().toISOString().replace(/[:.]/g, '-');
        const a = renderer.createElement('a');
        renderer.setAttribute(a, 'href', url);
        renderer.setAttribute(a, 'download', `grabacion-${fecha}.webm`);
        renderer.setStyle(a, 'display', 'none');
        renderer.appendChild(document.body, a);
        a.click();
        renderer.removeChild(document.body, a);
        setTimeout(() => this.showWatchButton$.next(true));
      };

      this.mediaRecorder.start();
      this.isRecording$.next(true);
      this.isPaused$.next(false);
      this.startTimer();

    } catch (err: any) {
      this.isCountingDown$.next(false);
      if (err.name === 'NotAllowedError') {
        this.notificationService.error('📵 Permiso denegado para compartir pantalla. activar microfono');
      } else if (err.name === 'NotFoundError') {
        this.notificationService.error('🎙️ No se encontró micrófono o cámara.');
      } else {
        this.notificationService.error(`❗ Error: ${err.message}`);
      }
      console.error('Error al iniciar grabación:', err);

    }
  }

  pause() {
    if (this.mediaRecorder && this.isRecording$.value && !this.isPaused$.value) {
      this.mediaRecorder.pause();
      this.isPaused$.next(true);
    }
  }

  resume() {
    if (this.mediaRecorder && this.isRecording$.value && this.isPaused$.value) {
      this.mediaRecorder.resume();
      this.isPaused$.next(false);
    }
  }

  stop() {
    if (this.mediaRecorder && this.isRecording$.value) {
      this.mediaRecorder.stop();
      this.isRecording$.next(false);
      this.isPaused$.next(false);
      this.notificationService.success('Grabación detenida.');
    }
  }

  reset() {
    window.location.reload();
  }


  mostrarVistaFinal() {
    this.showFinalVideo$.next(true);
  }
}
