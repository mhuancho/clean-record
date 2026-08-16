import { Injectable } from '@angular/core';

export interface RecordingOptions {
  quality: '720p' | '1080p';
  includeMicrophone: boolean;
  includeSystemAudio: boolean;
  allowSimultaneousAudio?: boolean;
}

export interface RecordingMedia {
  stream: MediaStream;
  cleanup: () => void;
  details: {
    width?: number;
    height?: number;
    frameRate?: number;
    microphoneCaptured: boolean;
    systemAudioCaptured: boolean;
  };
}

type ScreenVideoConstraints = MediaTrackConstraints & {
  displaySurface?: 'monitor';
};

type ScreenAudioConstraints = MediaTrackConstraints & {
  restrictOwnAudio?: boolean;
  suppressLocalAudioPlayback?: boolean;
};

type ExtendedSupportedConstraints = MediaTrackSupportedConstraints & {
  restrictOwnAudio?: boolean;
  suppressLocalAudioPlayback?: boolean;
};

type ExtendedDisplayMediaOptions = DisplayMediaStreamOptions & {
  audio: boolean | ScreenAudioConstraints;
  video: ScreenVideoConstraints;
  monitorTypeSurfaces?: 'include';
  preferCurrentTab?: boolean;
  selfBrowserSurface?: 'exclude';
  surfaceSwitching?: 'exclude';
  systemAudio?: 'include' | 'exclude';
};

@Injectable({ providedIn: 'root' })
export class ScreenRecorderService {
  async getCombinedStream(options: RecordingOptions): Promise<RecordingMedia> {
    const includeSystemAudio = options.includeSystemAudio
      && (!options.includeMicrophone || options.allowSimultaneousAudio === true);
    const supportedConstraints = navigator.mediaDevices.getSupportedConstraints?.() as ExtendedSupportedConstraints | undefined;
    const systemAudioConstraints: ScreenAudioConstraints = {
      ...(supportedConstraints?.restrictOwnAudio ? { restrictOwnAudio: true } : {}),
      ...(supportedConstraints?.suppressLocalAudioPlayback ? { suppressLocalAudioPlayback: true } : {})
    };
    const videoConstraints: ScreenVideoConstraints = {
      width: options.quality === '1080p' ? { ideal: 1920 } : { ideal: 1280 },
      height: options.quality === '1080p' ? { ideal: 1080 } : { ideal: 720 },
      frameRate: { ideal: 30, max: 30 },
      displaySurface: 'monitor'
    };
    const displayOptions: ExtendedDisplayMediaOptions = {
      video: videoConstraints,
      audio: includeSystemAudio ? systemAudioConstraints : false,
      monitorTypeSurfaces: 'include',
      preferCurrentTab: false,
      selfBrowserSurface: 'exclude',
      surfaceSwitching: 'exclude',
      systemAudio: includeSystemAudio ? 'include' : 'exclude'
    };

    let screenStream: MediaStream | undefined;
    let micStream: MediaStream | null = null;
    let audioContext: AudioContext | null = null;

    try {
      screenStream = await navigator.mediaDevices.getDisplayMedia(displayOptions);
      const activeScreenStream = screenStream;
      micStream = options.includeMicrophone
        ? await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: { exact: true },
            noiseSuppression: { ideal: true },
            autoGainControl: { ideal: true },
            channelCount: { ideal: 1 },
            sampleRate: { ideal: 48_000 },
            sampleSize: { ideal: 16 }
          }
        })
        : null;

      const systemAudioTracks = includeSystemAudio ? activeScreenStream.getAudioTracks() : [];
      const microphoneTracks = micStream?.getAudioTracks() ?? [];
      systemAudioTracks.forEach(track => track.contentHint = 'music');
      microphoneTracks.forEach(track => track.contentHint = 'speech');

      let outputAudioTracks: MediaStreamTrack[] = [];
      const sourceAudioTracks = [...systemAudioTracks, ...microphoneTracks];

      if (sourceAudioTracks.length === 1) {
        // Una fuente no necesita mezcla ni remuestreo. Mantener la pista original
        // conserva el procesamiento acústico aplicado por el navegador.
        outputAudioTracks = sourceAudioTracks;
      } else if (sourceAudioTracks.length > 1) {
        audioContext = new AudioContext({ latencyHint: 'interactive' });
        const destination = audioContext.createMediaStreamDestination();
        const mixer = audioContext.createGain();
        const limiter = audioContext.createDynamicsCompressor();

        mixer.gain.value = 0.9;
        limiter.threshold.value = -18;
        limiter.knee.value = 12;
        limiter.ratio.value = 4;
        limiter.attack.value = 0.003;
        limiter.release.value = 0.25;
        mixer.connect(limiter);
        limiter.connect(destination);

        for (const track of systemAudioTracks) {
          const source = audioContext.createMediaStreamSource(new MediaStream([track]));
          const gain = audioContext.createGain();
          gain.gain.value = 0.85;
          source.connect(gain);
          gain.connect(mixer);
        }

        for (const track of microphoneTracks) {
          const source = audioContext.createMediaStreamSource(new MediaStream([track]));
          const highPassFilter = audioContext.createBiquadFilter();
          const gain = audioContext.createGain();
          highPassFilter.type = 'highpass';
          highPassFilter.frequency.value = 90;
          highPassFilter.Q.value = 0.7;
          gain.gain.value = 1;
          source.connect(highPassFilter);
          highPassFilter.connect(gain);
          gain.connect(mixer);
        }

        if (audioContext.state === 'suspended') {
          await audioContext.resume();
        }

        outputAudioTracks = destination.stream.getAudioTracks();
        outputAudioTracks.forEach(track => {
          track.contentHint = systemAudioTracks.length > 0 ? 'music' : 'speech';
        });
      }

      activeScreenStream.getVideoTracks().forEach(track => track.contentHint = 'detail');
      const videoSettings = activeScreenStream.getVideoTracks()[0]?.getSettings?.() ?? {};
      const stream = new MediaStream([
        ...activeScreenStream.getVideoTracks(),
        ...outputAudioTracks
      ]);

      let cleaned = false;

      return {
        stream,
        details: {
          width: videoSettings.width,
          height: videoSettings.height,
          frameRate: videoSettings.frameRate,
          microphoneCaptured: microphoneTracks.length > 0,
          systemAudioCaptured: systemAudioTracks.length > 0
        },
        cleanup: () => {
          if (cleaned) return;
          cleaned = true;
          const tracks = new Set([
            ...stream.getTracks(),
            ...activeScreenStream.getTracks(),
            ...(micStream?.getTracks() ?? [])
          ]);
          tracks.forEach(track => track.stop());
          if (audioContext && audioContext.state !== 'closed') {
            void audioContext.close();
          }
        }
      };
    } catch (error) {
      screenStream?.getTracks().forEach(track => track.stop());
      micStream?.getTracks().forEach(track => track.stop());
      if (audioContext && audioContext.state !== 'closed') {
        void audioContext.close();
      }
      console.error('Error al obtener el flujo de grabación:', error);
      throw error;
    }
  }
}
