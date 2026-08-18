const crypto = require('node:crypto');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const { once } = require('node:events');
const { fileURLToPath, pathToFileURL } = require('node:url');
const {
  app,
  BrowserWindow,
  desktopCapturer,
  dialog,
  globalShortcut,
  ipcMain,
  net,
  protocol,
  screen,
  session,
  shell
} = require('electron/main');
const { autoUpdater } = require('electron-updater');

const PRODUCT_NAME = 'CleanRecord';
const ANGULAR_INDEX = path.join(__dirname, '..', 'dist', 'clean-record', 'browser', 'index.html');
const ANGULAR_DIRECTORY = path.dirname(ANGULAR_INDEX);
const PRELOAD_PATH = path.join(__dirname, 'preload.cjs');
const OVERLAY_PRELOAD_PATH = path.join(__dirname, 'overlay-preload.cjs');
const OVERLAY_HTML_PATH = path.join(__dirname, 'overlay.html');
const ICON_PATH = path.join(__dirname, '..', 'build', 'icon.ico');
function getUpdateUrl() {
  const environmentUrl = process.env.CLEANRECORD_UPDATE_URL?.trim();
  if (environmentUrl) return environmentUrl;
  try {
    const config = JSON.parse(fs.readFileSync(path.join(__dirname, 'update-config.json'), 'utf8'));
    return typeof config.url === 'string' ? config.url.trim() : undefined;
  } catch {
    return undefined;
  }
}

const UPDATE_URL = getUpdateUrl();
const DEFAULT_SHORTCUTS = Object.freeze({
  toggle: 'CommandOrControl+Shift+R',
  pause: 'CommandOrControl+Shift+P',
  stop: 'CommandOrControl+Shift+X'
});

if (process.env.CLEANRECORD_TEST_USER_DATA) {
  app.setPath('userData', path.resolve(process.env.CLEANRECORD_TEST_USER_DATA));
}

protocol.registerSchemesAsPrivileged([{
  scheme: 'cleanrecord-media',
  privileges: {
    standard: true,
    secure: true,
    supportFetchAPI: true,
    stream: true
  }
}]);

let mainWindow;
let overlayWindow;
let isQuitting = false;
let settingsCache;
let historyCache = [];
let updateState = {
  status: UPDATE_URL ? 'idle' : 'disabled',
  message: UPDATE_URL ? 'Actualizaciones disponibles al publicar una nueva versión.' : 'Canal de actualizaciones no configurado.'
};
const activeSessions = new Map();
const recorderState = {
  isRecording: false,
  isPaused: false,
  time: '00:00',
  audioLabel: 'Grabando pantalla',
  microphoneLevel: 0,
  systemAudioLevel: 0,
  hasUnsavedRecording: false
};

function getStoragePaths() {
  const userData = app.getPath('userData');
  return {
    historyFile: path.join(userData, 'recordings.json'),
    settingsFile: path.join(userData, 'settings.json'),
    recoveryDirectory: path.join(userData, 'recovery')
  };
}

function getDefaultSettings() {
  return {
    lastSaveDirectory: app.getPath('videos'),
    autoSave: false,
    shortcuts: { ...DEFAULT_SHORTCUTS }
  };
}

function sanitizeFileBase(value) {
  const sanitized = String(value || 'grabacion')
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, '-')
    .trim()
    .replace(/\.webm$/i, '')
    .trim();
  return sanitized || 'grabacion';
}

function isPathInside(parent, target) {
  const relative = path.relative(path.resolve(parent), path.resolve(target));
  return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative);
}

function isTrustedUrl(rawUrl) {
  try {
    const url = new URL(rawUrl);
    if (url.protocol === 'file:') {
      const requestedPath = path.resolve(fileURLToPath(url));
      return requestedPath === ANGULAR_INDEX
        || requestedPath === ANGULAR_DIRECTORY
        || requestedPath.startsWith(`${ANGULAR_DIRECTORY}${path.sep}`)
        || requestedPath === OVERLAY_HTML_PATH;
    }

    return url.protocol === 'http:'
      && url.port === '4200'
      && ['localhost', '127.0.0.1'].includes(url.hostname);
  } catch {
    return false;
  }
}

// Una página cargada con loadFile tiene un origen opaco. Chromium lo serializa como
// "file:///" o "null" según la API, así que esos valores no identifican a nadie y la
// confianza se resuelve con la URL real del documento.
function isOpaqueOrigin(origin) {
  return !origin || origin === 'null' || /^file:\/{2,3}$/.test(origin);
}

function isTrustedRequest(origin, pageUrl) {
  if (isOpaqueOrigin(origin)) return isTrustedUrl(pageUrl);
  return isTrustedUrl(origin);
}

function assertTrustedSender(event) {
  if (!isTrustedUrl(event.sender.getURL())) {
    throw new Error('Solicitud IPC rechazada por origen no confiable.');
  }
}

async function readJson(filePath, fallback) {
  try {
    return JSON.parse(await fsp.readFile(filePath, 'utf8'));
  } catch (error) {
    if (error?.code !== 'ENOENT') console.error(`No fue posible leer ${filePath}:`, error);
    return fallback;
  }
}

async function writeJsonAtomic(filePath, value) {
  await fsp.mkdir(path.dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.${process.pid}.tmp`;
  await fsp.writeFile(tempPath, JSON.stringify(value, null, 2), 'utf8');
  await fsp.rename(tempPath, filePath);
}

async function persistSettings() {
  await writeJsonAtomic(getStoragePaths().settingsFile, settingsCache);
}

async function persistHistory() {
  await writeJsonAtomic(getStoragePaths().historyFile, historyCache);
}

function toPreviewUrl(id) {
  return `cleanrecord-media://recording/${encodeURIComponent(id)}`;
}

function serializeEntry(entry) {
  return {
    id: entry.id,
    name: entry.name,
    createdAt: entry.createdAt,
    duration: entry.duration,
    size: entry.size,
    resolution: entry.resolution,
    frameRate: entry.frameRate,
    audio: entry.audio,
    recovered: Boolean(entry.recovered),
    saved: Boolean(entry.saved),
    previewUrl: toPreviewUrl(entry.id)
  };
}

function findHistoryEntry(id) {
  return historyCache.find(entry => entry.id === id);
}

async function loadPersistentState() {
  const paths = getStoragePaths();
  await fsp.mkdir(paths.recoveryDirectory, { recursive: true });

  const rawSettings = await readJson(paths.settingsFile, getDefaultSettings());
  settingsCache = {
    lastSaveDirectory: rawSettings.lastSaveDirectory || app.getPath('videos'),
    autoSave: Boolean(rawSettings.autoSave),
    shortcuts: {
      ...DEFAULT_SHORTCUTS,
      ...(rawSettings.shortcuts || {})
    }
  };

  const rawHistory = await readJson(paths.historyFile, []);
  historyCache = Array.isArray(rawHistory) ? rawHistory : [];
  historyCache = historyCache.filter(entry => entry?.id && entry?.filePath);

  const referencedFiles = new Set(historyCache.map(entry => path.resolve(entry.filePath)));
  const recoveryFiles = await fsp.readdir(paths.recoveryDirectory, { withFileTypes: true });
  for (const file of recoveryFiles) {
    if (!file.isFile() || !file.name.toLowerCase().endsWith('.webm')) continue;
    const filePath = path.join(paths.recoveryDirectory, file.name);
    if (referencedFiles.has(path.resolve(filePath))) continue;

    const stat = await fsp.stat(filePath);
    if (stat.size === 0) {
      await fsp.unlink(filePath);
      continue;
    }

    historyCache.unshift({
      id: path.basename(file.name, '.webm'),
      filePath,
      name: `Recuperada ${stat.mtime.toISOString().slice(0, 16).replace('T', ' ')}.webm`,
      createdAt: stat.mtime.toISOString(),
      duration: 'No disponible',
      size: stat.size,
      resolution: 'No disponible',
      frameRate: 'No disponible',
      audio: 'No disponible',
      recovered: true,
      saved: false
    });
  }

  historyCache = historyCache
    .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt))
    .slice(0, 50);
  await Promise.all([persistSettings(), persistHistory()]);
}

function configureCapturePermissions() {
  const currentSession = session.defaultSession;

  currentSession.setPermissionCheckHandler((webContents, permission, requestingOrigin, details) => {
    const pageUrl = webContents?.getURL() || details.requestingUrl || '';
    if (!isTrustedRequest(requestingOrigin, pageUrl)) return false;
    if (permission === 'display-capture') return true;
    if (permission !== 'media') return false;
    // La consulta previa a enumerateDevices y a getUserMedia llega sin tipo declarado.
    // Rechazarla oculta los nombres de los micrófonos y marca el permiso como denegado.
    return details.mediaType === 'audio' || !details.mediaType || details.mediaType === 'unknown';
  });

  currentSession.setPermissionRequestHandler((webContents, permission, callback, details) => {
    const requestingUrl = details.requestingUrl || webContents.getURL();
    if (!isTrustedRequest(requestingUrl, webContents.getURL())) {
      callback(false);
      return;
    }

    if (permission === 'display-capture') {
      callback(true);
      return;
    }

    if (permission !== 'media') {
      callback(false);
      return;
    }

    // getDisplayMedia pide el permiso "media" sin tipos declarados. La superficie real
    // la sigue eligiendo setDisplayMediaRequestHandler, que solo entrega el monitor
    // principal. Una lista con tipos concretos solo se acepta si pide audio.
    const requestedMedia = details.mediaTypes || [];
    callback(requestedMedia.length === 0 || requestedMedia.every(type => type === 'audio'));
  });

  currentSession.setDisplayMediaRequestHandler(async (request, callback) => {
    if (!isTrustedRequest(request.securityOrigin, request.frame?.url ?? '') || !request.videoRequested) {
      callback({});
      return;
    }

    try {
      const primaryDisplayId = String(screen.getPrimaryDisplay().id);
      const sources = await desktopCapturer.getSources({
        types: ['screen'],
        thumbnailSize: { width: 0, height: 0 },
        fetchWindowIcons: false
      });
      const primaryScreen = sources.find(source => source.display_id === primaryDisplayId) ?? sources[0];
      if (!primaryScreen) {
        callback({});
        return;
      }

      callback({
        video: primaryScreen,
        ...(request.audioRequested && process.platform === 'win32' ? { audio: 'loopback' } : {})
      });
    } catch (error) {
      console.error('No fue posible seleccionar el monitor principal:', error);
      callback({});
    }
  }, { useSystemPicker: false });
}

function hardenWindow(window) {
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', (event, url) => {
    if (!isTrustedUrl(url)) event.preventDefault();
  });
}

function sendRecorderCommand(command) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (!recorderState.isRecording) {
    mainWindow.show();
    mainWindow.focus();
  }
  mainWindow.webContents.send('recorder:command', command);
}

function positionOverlay() {
  if (!overlayWindow || overlayWindow.isDestroyed()) return;
  const { workArea } = screen.getPrimaryDisplay();
  const [width, height] = overlayWindow.getSize();
  overlayWindow.setPosition(
    Math.round(workArea.x + (workArea.width - width) / 2),
    workArea.y + workArea.height - height - 18,
    false
  );
}

function createOverlayWindow() {
  if (overlayWindow && !overlayWindow.isDestroyed()) return overlayWindow;
  overlayWindow = new BrowserWindow({
    width: 376,
    height: 76,
    frame: false,
    transparent: true,
    resizable: false,
    maximizable: false,
    minimizable: false,
    fullscreenable: false,
    show: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    backgroundColor: '#00000000',
    webPreferences: {
      preload: OVERLAY_PRELOAD_PATH,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });
  overlayWindow.setAlwaysOnTop(true, 'screen-saver');
  overlayWindow.setContentProtection(true);
  overlayWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  hardenWindow(overlayWindow);
  overlayWindow.on('closed', () => {
    overlayWindow = undefined;
  });
  void overlayWindow.loadFile(OVERLAY_HTML_PATH);
  positionOverlay();
  return overlayWindow;
}

function updateDesktopRecorderUi() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (recorderState.isRecording) {
    const controls = createOverlayWindow();
    mainWindow.hide();
    controls.webContents.send('overlay:state', recorderState);
    controls.showInactive();
    positionOverlay();
  } else {
    if (overlayWindow && !overlayWindow.isDestroyed()) overlayWindow.hide();
    mainWindow.setContentProtection(false);
    mainWindow.show();
    mainWindow.focus();
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 760,
    minHeight: 620,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#f1f5f9',
    ...(fs.existsSync(ICON_PATH) ? { icon: ICON_PATH } : {}),
    webPreferences: {
      preload: PRELOAD_PATH,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  hardenWindow(mainWindow);
  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.on('close', event => {
    if ((!recorderState.isRecording && !recorderState.hasUnsavedRecording) || isQuitting) return;
    event.preventDefault();
    mainWindow.show();
    const recordingInProgress = recorderState.isRecording;
    void dialog.showMessageBox(mainWindow, {
      type: 'warning',
      title: recordingInProgress ? 'Grabación en curso' : 'Grabación sin guardar',
      message: recordingInProgress ? 'Hay una grabación en curso.' : 'La última grabación todavía no se ha guardado en una carpeta.',
      detail: recordingInProgress
        ? 'Detén la captura antes de cerrar para conservar el archivo de recuperación.'
        : 'La copia de recuperación seguirá disponible en el historial si decides cerrar.',
      buttons: [recordingInProgress ? 'Continuar grabando' : 'Volver', recordingInProgress ? 'Detener y cerrar' : 'Cerrar'],
      defaultId: 0,
      cancelId: 0,
      noLink: true
    }).then(({ response }) => {
      if (response !== 1) return;
      sendRecorderCommand('stop');
      isQuitting = true;
      setTimeout(() => app.quit(), 800);
    });
  });
  mainWindow.on('closed', () => {
    mainWindow = undefined;
  });
  void mainWindow.loadFile(ANGULAR_INDEX);
}

async function writeChunk(recordingSession, chunk) {
  const buffer = Buffer.from(chunk);
  if (buffer.byteLength > 64 * 1024 * 1024) {
    throw new Error('El fragmento excede el tamaño máximo permitido.');
  }
  await new Promise((resolve, reject) => {
    recordingSession.stream.write(buffer, error => error ? reject(error) : resolve());
  });
  recordingSession.bytesWritten += buffer.byteLength;
}

async function closeRecordingSession(recordingSession) {
  await recordingSession.writeChain;
  await new Promise((resolve, reject) => {
    recordingSession.stream.end(error => error ? reject(error) : resolve());
  });
}

function validateMetadata(metadata) {
  return {
    name: `${sanitizeFileBase(metadata?.name)}.webm`,
    duration: String(metadata?.duration || '00:00').slice(0, 32),
    resolution: String(metadata?.resolution || 'No disponible').slice(0, 64),
    frameRate: String(metadata?.frameRate || 'No disponible').slice(0, 64),
    audio: String(metadata?.audio || 'Sin audio').slice(0, 128)
  };
}

async function getAvailableFilePath(directory, fileName) {
  const extension = path.extname(fileName);
  const baseName = path.basename(fileName, extension);
  let candidate = path.join(directory, fileName);
  let suffix = 2;
  while (fs.existsSync(candidate)) {
    candidate = path.join(directory, `${baseName}-${suffix}${extension}`);
    suffix++;
  }
  return candidate;
}

function registerShortcutSet(shortcuts) {
  globalShortcut.unregisterAll();
  const definitions = [
    [shortcuts.toggle, () => sendRecorderCommand('toggle-recording')],
    [shortcuts.pause, () => sendRecorderCommand(recorderState.isPaused ? 'resume' : 'pause')],
    [shortcuts.stop, () => sendRecorderCommand('stop')]
  ];
  const registered = [];
  for (const [accelerator, handler] of definitions) {
    if (typeof accelerator !== 'string' || accelerator.length < 3 || accelerator.length > 80) {
      globalShortcut.unregisterAll();
      return false;
    }
    const success = globalShortcut.register(accelerator, handler);
    if (!success) {
      globalShortcut.unregisterAll();
      return false;
    }
    registered.push(accelerator);
  }
  return new Set(registered).size === definitions.length;
}

function emitUpdateState(nextState) {
  updateState = { ...updateState, ...nextState };
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('updates:state', updateState);
  }
}

function configureAutoUpdater() {
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;
  if (!app.isPackaged || !UPDATE_URL) return;

  autoUpdater.setFeedURL({ provider: 'generic', url: UPDATE_URL });
  autoUpdater.on('checking-for-update', () => emitUpdateState({ status: 'checking', message: 'Buscando actualizaciones…' }));
  autoUpdater.on('update-available', info => emitUpdateState({
    status: 'available',
    message: `La versión ${info.version} está disponible.`,
    version: info.version
  }));
  autoUpdater.on('update-not-available', () => emitUpdateState({
    status: 'not-available',
    message: 'CleanRecord está actualizado.'
  }));
  autoUpdater.on('download-progress', progress => emitUpdateState({
    status: 'downloading',
    message: `Descargando actualización: ${Math.round(progress.percent)} %`,
    progress: Math.round(progress.percent)
  }));
  autoUpdater.on('update-downloaded', info => emitUpdateState({
    status: 'downloaded',
    message: `La versión ${info.version} está lista para instalar.`,
    version: info.version,
    progress: 100
  }));
  autoUpdater.on('error', error => emitUpdateState({
    status: 'error',
    message: `No fue posible actualizar: ${error.message}`
  }));
}

function registerIpcHandlers() {
  ipcMain.handle('app:get-info', event => {
    assertTrustedSender(event);
    return {
      name: PRODUCT_NAME,
      version: app.getVersion(),
      platform: process.platform,
      updateConfigured: Boolean(app.isPackaged && UPDATE_URL)
    };
  });

  ipcMain.handle('settings:get', event => {
    assertTrustedSender(event);
    return settingsCache;
  });

  ipcMain.handle('settings:update-shortcuts', async (event, shortcuts) => {
    assertTrustedSender(event);
    const normalized = {
      toggle: String(shortcuts?.toggle || '').trim(),
      pause: String(shortcuts?.pause || '').trim(),
      stop: String(shortcuts?.stop || '').trim()
    };
    if (new Set(Object.values(normalized)).size !== 3 || !registerShortcutSet(normalized)) {
      registerShortcutSet(settingsCache.shortcuts);
      return {
        ok: false,
        message: 'Uno de los atajos no es válido, está repetido o ya lo utiliza otra aplicación.',
        shortcuts: settingsCache.shortcuts
      };
    }
    settingsCache.shortcuts = normalized;
    await persistSettings();
    return { ok: true, shortcuts: settingsCache.shortcuts };
  });

  ipcMain.handle('settings:update-auto-save', async (event, enabled) => {
    assertTrustedSender(event);
    settingsCache.autoSave = Boolean(enabled);
    await persistSettings();
    return settingsCache;
  });

  ipcMain.handle('system:open-media-settings', async event => {
    assertTrustedSender(event);
    if (process.platform === 'win32') {
      await shell.openExternal('ms-settings:privacy-microphone');
    } else if (process.platform === 'darwin') {
      await shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone');
    }
  });

  ipcMain.handle('recording:start-session', async (event, metadata) => {
    assertTrustedSender(event);
    const { recoveryDirectory } = getStoragePaths();
    await fsp.mkdir(recoveryDirectory, { recursive: true });
    const sessionId = crypto.randomUUID();
    const filePath = path.join(recoveryDirectory, `${sessionId}.webm`);
    const stream = fs.createWriteStream(filePath, { flags: 'wx' });
    await once(stream, 'open');
    activeSessions.set(sessionId, {
      id: sessionId,
      filePath,
      stream,
      bytesWritten: 0,
      writeChain: Promise.resolve(),
      mimeType: String(metadata?.mimeType || 'video/webm'),
      quality: String(metadata?.quality || '1080p')
    });
    return { sessionId };
  });

  ipcMain.handle('recording:append-chunk', async (event, payload) => {
    assertTrustedSender(event);
    const recordingSession = activeSessions.get(payload?.sessionId);
    if (!recordingSession) throw new Error('La sesión de grabación ya no está disponible.');
    recordingSession.writeChain = recordingSession.writeChain.then(() => writeChunk(recordingSession, payload.chunk));
    await recordingSession.writeChain;
    return { bytesWritten: recordingSession.bytesWritten };
  });

  ipcMain.handle('recording:finish-session', async (event, payload) => {
    assertTrustedSender(event);
    const recordingSession = activeSessions.get(payload?.sessionId);
    if (!recordingSession) throw new Error('La sesión de grabación ya no está disponible.');
    await closeRecordingSession(recordingSession);
    activeSessions.delete(recordingSession.id);

    const stat = await fsp.stat(recordingSession.filePath);
    const metadata = validateMetadata(payload.metadata);
    const entry = {
      id: recordingSession.id,
      filePath: recordingSession.filePath,
      name: metadata.name,
      createdAt: new Date().toISOString(),
      duration: metadata.duration,
      size: stat.size,
      resolution: metadata.resolution,
      frameRate: metadata.frameRate,
      audio: metadata.audio,
      recovered: false,
      saved: false
    };
    if (settingsCache.autoSave) {
      const destinationDirectory = settingsCache.lastSaveDirectory || app.getPath('videos');
      await fsp.mkdir(destinationDirectory, { recursive: true });
      const destination = await getAvailableFilePath(destinationDirectory, entry.name);
      await fsp.copyFile(entry.filePath, destination);
      await fsp.unlink(entry.filePath);
      entry.filePath = destination;
      entry.name = path.basename(destination);
      entry.saved = true;
    }
    historyCache = [entry, ...historyCache.filter(item => item.id !== entry.id)].slice(0, 50);
    await persistHistory();
    return { entry: serializeEntry(entry) };
  });

  ipcMain.handle('recording:abandon-session', async (event, sessionId) => {
    assertTrustedSender(event);
    const recordingSession = activeSessions.get(sessionId);
    if (!recordingSession) return;
    await closeRecordingSession(recordingSession);
    activeSessions.delete(sessionId);
    if (recordingSession.bytesWritten === 0) {
      await fsp.unlink(recordingSession.filePath).catch(() => undefined);
    }
  });

  ipcMain.handle('recording:save', async (event, request) => {
    assertTrustedSender(event);
    const entry = findHistoryEntry(request?.id);
    if (!entry) throw new Error('La grabación ya no está disponible.');
    const fileName = `${sanitizeFileBase(request?.fileName || entry.name)}.webm`;
    const result = await dialog.showSaveDialog(mainWindow, {
      title: 'Guardar grabación',
      defaultPath: path.join(settingsCache.lastSaveDirectory || app.getPath('videos'), fileName),
      filters: [{ name: 'Video WebM', extensions: ['webm'] }],
      properties: ['showOverwriteConfirmation', 'createDirectory']
    });
    if (result.canceled || !result.filePath) return { canceled: true };

    const destination = result.filePath.toLowerCase().endsWith('.webm')
      ? result.filePath
      : `${result.filePath}.webm`;
    if (path.resolve(destination) !== path.resolve(entry.filePath)) {
      await fsp.copyFile(entry.filePath, destination);
      const { recoveryDirectory } = getStoragePaths();
      if (isPathInside(recoveryDirectory, entry.filePath)) {
        await fsp.unlink(entry.filePath).catch(() => undefined);
      }
    }
    entry.filePath = destination;
    entry.name = path.basename(destination);
    entry.saved = true;
    entry.recovered = false;
    settingsCache.lastSaveDirectory = path.dirname(destination);
    await Promise.all([persistHistory(), persistSettings()]);
    return { canceled: false, entry: serializeEntry(entry) };
  });

  ipcMain.handle('history:list', event => {
    assertTrustedSender(event);
    return historyCache.map(serializeEntry);
  });

  ipcMain.handle('history:open', async (event, id) => {
    assertTrustedSender(event);
    const entry = findHistoryEntry(id);
    if (!entry) throw new Error('La grabación ya no existe en el historial.');
    const errorMessage = await shell.openPath(entry.filePath);
    if (errorMessage) throw new Error(errorMessage);
    return entry.filePath;
  });

  ipcMain.handle('history:show-in-folder', async (event, id) => {
    assertTrustedSender(event);
    const entry = findHistoryEntry(id);
    if (!entry) throw new Error('La grabación ya no existe en el historial.');
    shell.showItemInFolder(entry.filePath);
  });

  ipcMain.handle('history:remove', async (event, request) => {
    assertTrustedSender(event);
    const entry = findHistoryEntry(request?.id);
    if (!entry) return historyCache.map(serializeEntry);
    if (request.deleteFile) {
      const { recoveryDirectory } = getStoragePaths();
      if (isPathInside(recoveryDirectory, entry.filePath)) {
        await fsp.unlink(entry.filePath).catch(error => {
          if (error?.code !== 'ENOENT') throw error;
        });
      } else {
        await shell.trashItem(entry.filePath);
      }
    }
    historyCache = historyCache.filter(item => item.id !== entry.id);
    await persistHistory();
    return historyCache.map(serializeEntry);
  });

  ipcMain.on('recorder:state', (event, state) => {
    assertTrustedSender(event);
    Object.assign(recorderState, {
      isRecording: Boolean(state?.isRecording),
      isPaused: Boolean(state?.isPaused),
      time: String(state?.time || '00:00').slice(0, 16),
      audioLabel: String(state?.audioLabel || 'Grabando pantalla').slice(0, 80),
      microphoneLevel: Number(state?.microphoneLevel) || 0,
      systemAudioLevel: Number(state?.systemAudioLevel) || 0,
      hasUnsavedRecording: Boolean(state?.hasUnsavedRecording)
    });
    updateDesktopRecorderUi();
  });

  ipcMain.on('overlay:command', (event, command) => {
    if (!overlayWindow || event.sender !== overlayWindow.webContents) return;
    if (['pause', 'resume', 'stop'].includes(command)) sendRecorderCommand(command);
  });

  ipcMain.handle('updates:check', async event => {
    assertTrustedSender(event);
    if (!app.isPackaged || !UPDATE_URL) return updateState;
    await autoUpdater.checkForUpdates();
    return updateState;
  });

  ipcMain.handle('updates:download', async event => {
    assertTrustedSender(event);
    if (updateState.status === 'available') await autoUpdater.downloadUpdate();
    return updateState;
  });

  ipcMain.handle('updates:install', event => {
    assertTrustedSender(event);
    if (updateState.status === 'downloaded') autoUpdater.quitAndInstall(false, true);
  });
}

function configureMediaProtocol() {
  protocol.handle('cleanrecord-media', async request => {
    try {
      const url = new URL(request.url);
      const id = decodeURIComponent(url.pathname.split('/').filter(Boolean).pop() || '');
      const entry = findHistoryEntry(id);
      if (!entry || !fs.existsSync(entry.filePath)) {
        return new Response('Grabación no encontrada', { status: 404 });
      }
      return net.fetch(pathToFileURL(entry.filePath).toString(), {
        headers: request.headers
      });
    } catch (error) {
      console.error('No fue posible servir la grabación:', error);
      return new Response('No fue posible abrir la grabación', { status: 500 });
    }
  });
}

app.setName(PRODUCT_NAME);
if (process.platform === 'win32') app.setAppUserModelId('com.cleanrecord.desktop');

app.whenReady().then(async () => {
  await loadPersistentState();
  configureCapturePermissions();
  configureMediaProtocol();
  configureAutoUpdater();
  registerIpcHandlers();
  if (!registerShortcutSet(settingsCache.shortcuts)) {
    settingsCache.shortcuts = { ...DEFAULT_SHORTCUTS };
    registerShortcutSet(settingsCache.shortcuts);
    await persistSettings();
  }
  createWindow();

  screen.on('display-metrics-changed', positionOverlay);
  screen.on('display-added', positionOverlay);
  screen.on('display-removed', positionOverlay);

  app.on('activate', () => {
    if (!mainWindow || mainWindow.isDestroyed()) createWindow();
    else mainWindow.show();
  });
}).catch(error => {
  console.error('No fue posible iniciar CleanRecord:', error);
  app.quit();
});

app.on('before-quit', () => {
  isQuitting = true;
  globalShortcut.unregisterAll();
  for (const recordingSession of activeSessions.values()) {
    recordingSession.stream.end();
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
