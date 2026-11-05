const { app, BrowserWindow, shell, session } = require('electron');
const path = require('path');

/** Live staging customer app — same as phone HTTPS. */
const START_URL = process.env.VAKSINAMED_URL || 'https://77-83-206-192.sslip.io/';

/** Clear Windows desktop UA so push devices show as computer, not a phone. */
function desktopUserAgent() {
  const chrome = process.versions.chrome || '120.0.0.0';
  const electron = process.versions.electron || '0';
  const ver = app.getVersion();
  return (
    `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ` +
    `(KHTML, like Gecko) Chrome/${chrome} Safari/537.36 ` +
    `Electron/${electron} VaksinaMedDesktop/${ver}`
  );
}

function createWindow() {
  const win = new BrowserWindow({
    width: 420,
    height: 860,
    minWidth: 360,
    minHeight: 640,
    title: 'VaksinaMed',
    backgroundColor: '#F7F6FA',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  win.webContents.setUserAgent(desktopUserAgent());

  // Always revalidate HTML so deploys show up without reinstalling the shell.
  win.loadURL(START_URL, {
    extraHeaders: 'Cache-Control: no-cache\nPragma: no-cache\n',
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
}

app.whenReady().then(async () => {
  app.userAgentFallback = desktopUserAgent();
  try {
    await session.defaultSession.clearCache();
  } catch {
    // Non-fatal: still open the window.
  }

  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
