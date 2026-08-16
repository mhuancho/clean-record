const { contextBridge, ipcRenderer } = require('electron');

function subscribe(channel, callback) {
  const listener = (_event, payload) => callback(payload);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}

contextBridge.exposeInMainWorld('cleanRecordDesktop', {
  getAppInfo: () => ipcRenderer.invoke('app:get-info'),
  getSettings: () => ipcRenderer.invoke('settings:get'),
  updateShortcuts: shortcuts => ipcRenderer.invoke('settings:update-shortcuts', shortcuts),
  updateAutoSave: enabled => ipcRenderer.invoke('settings:update-auto-save', enabled),
  openMediaSettings: () => ipcRenderer.invoke('system:open-media-settings'),
  startRecordingSession: metadata => ipcRenderer.invoke('recording:start-session', metadata),
  appendRecordingChunk: (sessionId, chunk) => ipcRenderer.invoke('recording:append-chunk', { sessionId, chunk }),
  finishRecordingSession: (sessionId, metadata) => ipcRenderer.invoke('recording:finish-session', { sessionId, metadata }),
  abandonRecordingSession: sessionId => ipcRenderer.invoke('recording:abandon-session', sessionId),
  saveRecording: request => ipcRenderer.invoke('recording:save', request),
  listHistory: () => ipcRenderer.invoke('history:list'),
  openRecording: id => ipcRenderer.invoke('history:open', id),
  showRecordingInFolder: id => ipcRenderer.invoke('history:show-in-folder', id),
  removeHistoryEntry: request => ipcRenderer.invoke('history:remove', request),
  updateRecorderState: state => ipcRenderer.send('recorder:state', state),
  onRecorderCommand: callback => subscribe('recorder:command', callback),
  checkForUpdates: () => ipcRenderer.invoke('updates:check'),
  downloadUpdate: () => ipcRenderer.invoke('updates:download'),
  installUpdate: () => ipcRenderer.invoke('updates:install'),
  onUpdateState: callback => subscribe('updates:state', callback)
});
