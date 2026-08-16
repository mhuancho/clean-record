import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, OnInit, Renderer2 } from '@angular/core';
import { FormsModule } from '@angular/forms';
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
export class ScreenRecorderComponent implements OnInit {
  selectedQuality: '720p' | '1080p' = '1080p';
  includeMicrophone = true;
  includeSystemAudio = false;
  readonly isDesktopMode = typeof navigator !== 'undefined' && /Electron\//.test(navigator.userAgent);
  readonly isBrowserSupported = typeof navigator !== 'undefined'
    && !!navigator.mediaDevices?.getDisplayMedia
    && typeof MediaRecorder !== 'undefined';

  isRecording$!: Observable<boolean>;
  isPaused$!: Observable<boolean>;
  isCountingDown$!: Observable<boolean>;
  countdown$!: Observable<number>;
  recordingTime$!: Observable<string>;
  previewUrl$!: Observable<string | null>;
  showFinalVideo$!: Observable<boolean>;
  recordingSize$!: Observable<string>;
  recordingDate$!: Observable<Date | null>;

  constructor(
    private controller: ScreenRecorderControllerService,
    private renderer: Renderer2
  ) { }

  ngOnInit(): void {
    this.isRecording$ = this.controller.isRecording$;
    this.isPaused$ = this.controller.isPaused$;
    this.isCountingDown$ = this.controller.isCountingDown$;
    this.countdown$ = this.controller.countdown$;
    this.recordingTime$ = this.controller.recordingTime$;
    this.previewUrl$ = this.controller.previewUrl$;
    this.showFinalVideo$ = this.controller.showFinalVideo$;
    this.recordingSize$ = this.controller.recordingSize$;
    this.recordingDate$ = this.controller.recordingDate$;
  }

  startRecording() {
    const video = this.renderer.selectRootElement('#preview', true) as HTMLVideoElement;
    void this.controller.startRecording({
      quality: this.selectedQuality,
      includeMicrophone: this.includeMicrophone,
      includeSystemAudio: this.includeSystemAudio,
      allowSimultaneousAudio: this.isDesktopMode
    }, video);
  }

  setMicrophone(enabled: boolean) {
    this.includeMicrophone = enabled;
    if (enabled && !this.isDesktopMode) this.includeSystemAudio = false;
  }

  setSystemAudio(enabled: boolean) {
    this.includeSystemAudio = enabled;
    if (enabled && !this.isDesktopMode) this.includeMicrophone = false;
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
}
