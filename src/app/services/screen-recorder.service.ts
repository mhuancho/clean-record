import { Injectable } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class ScreenRecorderService {
  async getCombinedStream(selectedQuality: '720p' | '1080p'): Promise<MediaStream> {
    const constraints = {
      width: selectedQuality === '1080p' ? { ideal: 1920 } : { ideal: 1280 },
      height: selectedQuality === '1080p' ? { ideal: 1080 } : { ideal: 720 },
      frameRate: { ideal: 30 }
    };

    try {
      const screenStream = await navigator.mediaDevices.getDisplayMedia({
        video: constraints,
        audio: true,
      });

      const micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const audioContext = new AudioContext();
      const destination = audioContext.createMediaStreamDestination();

      if (screenStream.getAudioTracks().length > 0) {
        const systemSource = audioContext.createMediaStreamSource(new MediaStream(screenStream.getAudioTracks()));
        systemSource.connect(destination);
      }

      if (micStream.getAudioTracks().length > 0) {
        const micSource = audioContext.createMediaStreamSource(new MediaStream(micStream.getAudioTracks()));
        micSource.connect(destination);
      }

      return new MediaStream([
        ...screenStream.getVideoTracks(),
        ...destination.stream.getAudioTracks()
      ]);
    } catch (error) {
      console.error('🔴 Error al obtener flujo combinado:', error);
      throw error;
    }
  }
}
