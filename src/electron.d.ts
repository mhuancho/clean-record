interface DesktopRecordingSession {
  sessionId: string;
}

interface DesktopRecordingEntry {
  id: string;
  name: string;
  createdAt: string;
  duration: string;
  size: number;
  resolution: string;
  frameRate: string;
  audio: string;
  recovered: boolean;
  saved: boolean;
  previewUrl: string;
}

interface DesktopShortcutSettings {
  toggle: string;
  pause: string;
  stop: string;
}

interface DesktopAppInfo {
  name: string;
  version: string;
  platform: string;
  updateConfigured: boolean;
}

interface DesktopUpdateState {
  status: 'disabled' | 'idle' | 'checking' | 'available' | 'not-available' | 'downloading' | 'downloaded' | 'error';
  message: string;
  progress?: number;
  version?: string;
}

interface CleanRecordDesktopApi {
  getAppInfo(): Promise<DesktopAppInfo>;
  getSettings(): Promise<{ shortcuts: DesktopShortcutSettings; lastSaveDirectory?: string; autoSave: boolean }>;
  updateShortcuts(shortcuts: DesktopShortcutSettings): Promise<{ ok: boolean; message?: string; shortcuts: DesktopShortcutSettings }>;
  updateAutoSave(enabled: boolean): Promise<{ shortcuts: DesktopShortcutSettings; lastSaveDirectory?: string; autoSave: boolean }>;
  openMediaSettings(): Promise<void>;
  startRecordingSession(metadata: { mimeType: string; quality: string }): Promise<DesktopRecordingSession>;
  appendRecordingChunk(sessionId: string, chunk: ArrayBuffer): Promise<{ bytesWritten: number }>;
  finishRecordingSession(sessionId: string, metadata: {
    name: string;
    duration: string;
    resolution: string;
    frameRate: string;
    audio: string;
  }): Promise<{ entry: DesktopRecordingEntry }>;
  abandonRecordingSession(sessionId: string): Promise<void>;
  saveRecording(request: { id: string; fileName: string }): Promise<{ canceled: boolean; entry?: DesktopRecordingEntry }>;
  listHistory(): Promise<DesktopRecordingEntry[]>;
  openRecording(id: string): Promise<string>;
  showRecordingInFolder(id: string): Promise<void>;
  removeHistoryEntry(request: { id: string; deleteFile: boolean }): Promise<DesktopRecordingEntry[]>;
  updateRecorderState(state: { isRecording: boolean; isPaused: boolean; time: string; audioLabel: string; microphoneLevel: number; systemAudioLevel: number; hasUnsavedRecording: boolean }): void;
  onRecorderCommand(callback: (command: 'toggle-recording' | 'pause' | 'resume' | 'stop') => void): () => void;
  checkForUpdates(): Promise<DesktopUpdateState>;
  downloadUpdate(): Promise<DesktopUpdateState>;
  installUpdate(): Promise<void>;
  onUpdateState(callback: (state: DesktopUpdateState) => void): () => void;
}

interface Window {
  cleanRecordDesktop?: CleanRecordDesktopApi;
  cleanRecordOverlay?: {
    sendCommand(command: 'pause' | 'resume' | 'stop'): void;
    onState(callback: (state: { isPaused: boolean; time: string; audioLabel: string }) => void): () => void;
  };
}
