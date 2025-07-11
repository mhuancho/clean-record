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

  isRecording$!: Observable<boolean>;
  isPaused$!: Observable<boolean>;
  isCountingDown$!: Observable<boolean>;
  countdown$!: Observable<number>;
  recordingTime$!: Observable<string>;
  previewUrl$!: Observable<string | null>;
  showWatchButton$!: Observable<boolean>;
  showFinalVideo$!: Observable<boolean>;

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
    this.showWatchButton$ = this.controller.showWatchButton$;
    this.showFinalVideo$ = this.controller.showFinalVideo$;
  }

  startRecording() {
    const video = this.renderer.selectRootElement('#preview', true) as HTMLVideoElement;
    this.controller.startRecording(this.selectedQuality, video, this.renderer);
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

  onShowFinalVideo() {
    this.controller.mostrarVistaFinal();
  }
}
