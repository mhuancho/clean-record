import { TestBed } from '@angular/core/testing';

import { ScreenRecorderService } from './screen-recorder.service';

type FakeTrack = MediaStreamTrack & { stop: ReturnType<typeof vi.fn> };

class FakeMediaStream {
  constructor(private readonly tracks: MediaStreamTrack[] = []) { }

  getTracks(): MediaStreamTrack[] {
    return this.tracks;
  }

  getVideoTracks(): MediaStreamTrack[] {
    return this.tracks.filter(track => track.kind === 'video');
  }

  getAudioTracks(): MediaStreamTrack[] {
    return this.tracks.filter(track => track.kind === 'audio');
  }
}

function createTrack(kind: 'audio' | 'video'): FakeTrack {
  return {
    kind,
    contentHint: '',
    stop: vi.fn()
  } as unknown as FakeTrack;
}

describe('ScreenRecorderService', () => {
  let service: ScreenRecorderService;
  let getDisplayMedia: ReturnType<typeof vi.fn>;
  let getUserMedia: ReturnType<typeof vi.fn>;
  let getSupportedConstraints: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    getDisplayMedia = vi.fn();
    getUserMedia = vi.fn();
    getSupportedConstraints = vi.fn(() => ({
      restrictOwnAudio: true,
      suppressLocalAudioPlayback: true
    }));
    vi.stubGlobal('MediaStream', FakeMediaStream);
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getDisplayMedia, getUserMedia, getSupportedConstraints }
    });

    TestBed.configureTestingModule({});
    service = TestBed.inject(ScreenRecorderService);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('solicita el monitor completo y no pide micrófono cuando está desactivado', async () => {
    const videoTrack = createTrack('video');
    getDisplayMedia.mockResolvedValue(new FakeMediaStream([videoTrack]));

    const recording = await service.getCombinedStream({
      quality: '1080p',
      includeMicrophone: false,
      includeSystemAudio: false
    });

    expect(getDisplayMedia).toHaveBeenCalledWith(expect.objectContaining({
      audio: false,
      monitorTypeSurfaces: 'include',
      selfBrowserSurface: 'exclude',
      systemAudio: 'exclude',
      video: expect.objectContaining({
        displaySurface: 'monitor',
        width: { ideal: 1920 },
        height: { ideal: 1080 }
      })
    }));
    expect(getUserMedia).not.toHaveBeenCalled();
    expect(recording.stream.getVideoTracks()).toEqual([videoTrack]);

    recording.cleanup();
    recording.cleanup();
    expect(videoTrack.stop).toHaveBeenCalledTimes(1);
  });

  it('activa cancelación de eco y limita la mezcla de micrófono y sistema', async () => {
    const videoTrack = createTrack('video');
    const systemTrack = createTrack('audio');
    const microphoneTrack = createTrack('audio');
    const outputTrack = createTrack('audio');
    getDisplayMedia.mockResolvedValue(new FakeMediaStream([videoTrack, systemTrack]));
    getUserMedia.mockResolvedValue(new FakeMediaStream([microphoneTrack]));

    const connect = vi.fn();
    const close = vi.fn().mockResolvedValue(undefined);
    const audioContext = {
      state: 'running',
      close,
      createMediaStreamDestination: vi.fn(() => ({ stream: new FakeMediaStream([outputTrack]) })),
      createMediaStreamSource: vi.fn(() => ({ connect })),
      createGain: vi.fn(() => ({ gain: { value: 0 }, connect })),
      createDynamicsCompressor: vi.fn(() => ({
        threshold: { value: 0 },
        knee: { value: 0 },
        ratio: { value: 0 },
        attack: { value: 0 },
        release: { value: 0 },
        connect
      })),
      createBiquadFilter: vi.fn(() => ({
        type: 'lowpass',
        frequency: { value: 0 },
        Q: { value: 0 },
        connect
      }))
    };
    const AudioContextMock = vi.fn(function () {
      return audioContext;
    });
    vi.stubGlobal('AudioContext', AudioContextMock);

    const recording = await service.getCombinedStream({
      quality: '720p',
      includeMicrophone: true,
      includeSystemAudio: true,
      allowSimultaneousAudio: true
    });

    expect(getDisplayMedia).toHaveBeenCalledWith(expect.objectContaining({
      audio: {
        restrictOwnAudio: true,
        suppressLocalAudioPlayback: true
      },
      systemAudio: 'include'
    }));
    expect(getUserMedia).toHaveBeenCalledWith({
      audio: expect.objectContaining({
        echoCancellation: { exact: true },
        noiseSuppression: { ideal: true },
        autoGainControl: { ideal: true },
        channelCount: { ideal: 1 },
        sampleRate: { ideal: 48_000 }
      })
    });
    expect(audioContext.createDynamicsCompressor).toHaveBeenCalledOnce();
    expect(audioContext.createBiquadFilter).toHaveBeenCalledOnce();
    expect(recording.stream.getAudioTracks()).toEqual([outputTrack]);
    expect(microphoneTrack.contentHint).toBe('speech');
    expect(outputTrack.contentHint).toBe('music');

    recording.cleanup();
    expect(systemTrack.stop).toHaveBeenCalledOnce();
    expect(microphoneTrack.stop).toHaveBeenCalledOnce();
    expect(outputTrack.stop).toHaveBeenCalledOnce();
    expect(close).toHaveBeenCalledOnce();
  });

  it('evita mezclar micrófono y sistema cuando el modo web solicita ambos', async () => {
    const videoTrack = createTrack('video');
    getDisplayMedia.mockResolvedValue(new FakeMediaStream([videoTrack]));
    getUserMedia.mockResolvedValue(new FakeMediaStream());

    await service.getCombinedStream({
      quality: '1080p',
      includeMicrophone: true,
      includeSystemAudio: true
    });

    expect(getDisplayMedia).toHaveBeenCalledWith(expect.objectContaining({
      audio: false,
      systemAudio: 'exclude'
    }));
    expect(getUserMedia).toHaveBeenCalledOnce();
  });

  it('conserva directamente la pista del micrófono cuando es la única fuente', async () => {
    const videoTrack = createTrack('video');
    const microphoneTrack = createTrack('audio');
    const AudioContextMock = vi.fn();
    vi.stubGlobal('AudioContext', AudioContextMock);
    getDisplayMedia.mockResolvedValue(new FakeMediaStream([videoTrack]));
    getUserMedia.mockResolvedValue(new FakeMediaStream([microphoneTrack]));

    const recording = await service.getCombinedStream({
      quality: '1080p',
      includeMicrophone: true,
      includeSystemAudio: false
    });

    expect(AudioContextMock).not.toHaveBeenCalled();
    expect(recording.stream.getAudioTracks()).toEqual([microphoneTrack]);
    expect(microphoneTrack.contentHint).toBe('speech');
  });
});
