const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('cleanRecordOverlay', {
  sendCommand: command => ipcRenderer.send('overlay:command', command),
  onState: callback => {
    const listener = (_event, state) => callback(state);
    ipcRenderer.on('overlay:state', listener);
    return () => ipcRenderer.removeListener('overlay:state', listener);
  }
});
