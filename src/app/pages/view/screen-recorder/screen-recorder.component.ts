import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnDestroy, OnInit, Renderer2 } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NotificationService } from '@services/notification.service';
import { ScreenRecorderControllerService } from '@services/screen-recorder-controller.service';
import { Observable } from 'rxjs';

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
  includeSystemAudio = false;
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

  isTestingMicrophone = false;
  microphoneLevel = 0;
  microphoneName = 'Micrófono sin verificar';
  private microphoneTestStream?: MediaStream;
  private microphoneTestContext?: AudioContext;
  private microphoneAnimationFrame?: number;
  private isDestroyed = false;

  constructor(
    private controller: ScreenRecorderControllerService,
    private renderer: Renderer2,
    private cdr: ChangeDetectorRef,
    private notificationService: NotificationService
  ) { }

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
  }

  ngOnDestroy(): void {
    this.isDestroyed = true;
    this.stopMicrophoneTest();
  }

  startRecording() {
    this.stopMicrophoneTest();
    const video = this.renderer.selectRootElement('#preview', true) as HTMLVideoElement;
    void this.controller.startRecording({
      quality: this.selectedQuality,
      includeMicrophone: this.includeMicrophone,
      includeSystemAudio: this.includeSystemAudio,
      allowSimultaneousAudio: true
    }, video);
  }

  setMicrophone(enabled: boolean) {
    this.includeMicrophone = enabled;
    if (!enabled) this.stopMicrophoneTest();
  }

  setSystemAudio(enabled: boolean) {
    this.includeSystemAudio = enabled;
  }

  async toggleMicrophoneTest() {
    if (this.isTestingMicrophone) {
      this.stopMicrophoneTest();
      return;
    }

    try {
      this.microphoneTestStream = await navigator.mediaDevices.getUserMedia({
        audio: {
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
    this.controller.download(this.renderer);
  }

  renameRecording(value: string) {
    this.controller.updateRecordingFileName(value);
  }
}
