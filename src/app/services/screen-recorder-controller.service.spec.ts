import { TestBed } from '@angular/core/testing';

import { NotificationService } from './notification.service';
import { ScreenRecorderControllerService } from './screen-recorder-controller.service';
import { ScreenRecorderService } from './screen-recorder.service';

class MediaRecorderMock {
  static readonly instances: MediaRecorderMock[] = [];
  static isTypeSupported = vi.fn(() => true);

  ondataavailable: ((event: BlobEvent) => void) | null = null;
  onstop: (() => void) | null = null;
  readonly start = vi.fn();
  readonly pause = vi.fn();
  readonly resume = vi.fn();
  readonly stop = vi.fn();

  constructor(readonly stream: MediaStream, readonly options?: MediaRecorderOptions) {
    MediaRecorderMock.instances.push(this);
  }
}

describe('ScreenRecorderControllerService', () => {
  let service: ScreenRecorderControllerService;
  let getCombinedStream: ReturnType<typeof vi.fn>;
  let cleanup: ReturnType<typeof vi.fn>;
  let videoElement: HTMLVideoElement;
  let mediaDevicesDescriptor: PropertyDescriptor | undefined;

  beforeEach(() => {
    vi.useFakeTimers();
    MediaRecorderMock.instances.length = 0;
    MediaRecorderMock.isTypeSupported.mockClear();
    vi.stubGlobal('MediaRecorder', MediaRecorderMock);

    mediaDevicesDescriptor = Object.getOwnPropertyDescriptor(navigator, 'mediaDevices');
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getDisplayMedia: vi.fn() }
    });

    const videoTrack = {
      kind: 'video',
      readyState: 'live',
      addEventListener: vi.fn(),
      stop: vi.fn()
    } as unknown as MediaStreamTrack;
    const stream = {
      getVideoTracks: vi.fn(() => [videoTrack]),
      getAudioTracks: vi.fn(() => []),
      getTracks: vi.fn(() => [videoTrack])
    } as unknown as MediaStream;
    cleanup = vi.fn();
    getCombinedStream = vi.fn().mockResolvedValue({ stream, cleanup });
    videoElement = {
      srcObject: null,
      play: vi.fn().mockResolvedValue(undefined)
    } as unknown as HTMLVideoElement;

    const notificationService = {
      success: vi.fn(),
      error: vi.fn(),
      warning: vi.fn(),
      info: vi.fn()
    };

    TestBed.configureTestingModule({
      providers: [
        ScreenRecorderControllerService,
        { provide: ScreenRecorderService, useValue: { getCombinedStream } },
        { provide: NotificationService, useValue: notificationService }
      ]
    });
    service = TestBed.inject(ScreenRecorderControllerService);
  });

  afterEach(() => {
    service.reset();
    if (mediaDevicesDescriptor) {
      Object.defineProperty(navigator, 'mediaDevices', mediaDevicesDescriptor);
    } else {
      Reflect.deleteProperty(navigator, 'mediaDevices');
    }
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('adquiere la pantalla antes de iniciar la cuenta regresiva', async () => {
    const options = {
      quality: '1080p' as const,
      includeMicrophone: true,
      includeSystemAudio: true
    };

    await service.startRecording(options, videoElement);

    expect(getCombinedStream).toHaveBeenCalledWith(options);
    expect(videoElement.play).toHaveBeenCalledOnce();
    expect(videoElement.muted).toBe(true);
    expect(videoElement.volume).toBe(0);
    expect(service.isCountingDown$.value).toBe(true);
    expect(MediaRecorderMock.instances).toHaveLength(0);

    await vi.advanceTimersByTimeAsync(3_000);

    expect(MediaRecorderMock.instances).toHaveLength(1);
    expect(MediaRecorderMock.instances[0].start).toHaveBeenCalledOnce();
    expect(service.isRecording$.value).toBe(true);
  });

  it('libera la captura si se cancela durante la cuenta regresiva', async () => {
    await service.startRecording({
      quality: '720p',
      includeMicrophone: false,
      includeSystemAudio: false
    }, videoElement);

    service.cancelCountdown();
    await vi.advanceTimersByTimeAsync(3_000);

    expect(cleanup).toHaveBeenCalledOnce();
    expect(videoElement.srcObject).toBeNull();
    expect(MediaRecorderMock.instances).toHaveLength(0);
    expect(service.isRecording$.value).toBe(false);
  });
});
