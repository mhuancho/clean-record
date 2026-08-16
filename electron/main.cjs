const path = require('node:path');
const { fileURLToPath } = require('node:url');
const { app, BrowserWindow, desktopCapturer, screen, session } = require('electron/main');

const ANGULAR_INDEX = path.join(__dirname, '..', 'dist', 'clean-record', 'browser', 'index.html');
const ANGULAR_DIRECTORY = path.dirname(ANGULAR_INDEX);

function isTrustedUrl(rawUrl) {
  try {
    const url = new URL(rawUrl);
    if (url.protocol === 'file:') {
      const requestedPath = path.resolve(fileURLToPath(url));
      return requestedPath === ANGULAR_INDEX
        || requestedPath.startsWith(`${ANGULAR_DIRECTORY}${path.sep}`);
    }

    return url.protocol === 'http:'
      && url.port === '4200'
      && ['localhost', '127.0.0.1'].includes(url.hostname);
  } catch {
    return false;
  }
}

function isTrustedRequest(origin, pageUrl) {
  return isTrustedUrl(origin) || (origin === 'file://' && isTrustedUrl(pageUrl));
}

function configureCapturePermissions() {
  const currentSession = session.defaultSession;

  currentSession.setPermissionCheckHandler((webContents, permission, requestingOrigin, details) => {
    const pageUrl = webContents?.getURL() ?? details.requestingUrl ?? '';
    if (!isTrustedRequest(requestingOrigin, pageUrl)) return false;
    if (permission === 'display-capture') return true;
    if (permission !== 'media') return false;

    return details.mediaType === 'audio';
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

    const requestedMedia = details.mediaTypes || [];
    callback(permission === 'media'
      && requestedMedia.length > 0
      && requestedMedia.every(type => type === 'audio'));
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

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 960,
    minHeight: 680,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#f4f6fb',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  mainWindow.once('ready-to-show', () => mainWindow.show());
  void mainWindow.loadFile(ANGULAR_INDEX);
}

app.whenReady().then(() => {
  configureCapturePermissions();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
