const { app, BrowserWindow, ipcMain, nativeImage } = require('electron');
const path = require('path');
let win;
app.whenReady().then(() => {
  win = new BrowserWindow({ width: 1100, height: 720, minWidth: 800, minHeight: 560, autoHideMenuBar: true, title: 'Chat Frog',
    webPreferences: { preload: path.join(__dirname, 'preload.js'), autoplayPolicy: 'no-user-gesture-required' } });
  win.loadFile('index.html');
  win.on('focus', () => win.flashFrame(false));
});
// Perbaikan Windows: setelah dialog bawaan (pilih file / konfirmasi), keyboard kadang tidak masuk ke kolom ketik
ipcMain.on('refocus', e => { const w = BrowserWindow.fromWebContents(e.sender); if (!w) return; w.blur(); w.focus(); w.webContents.focus(); });
// Angka pesan belum dibaca di ikon taskbar + kedip saat ada pesan baru
ipcMain.on('badge', (e, url, n) => { if (win) win.setOverlayIcon(url ? nativeImage.createFromDataURL(url) : null, n ? n + ' pesan belum dibaca' : ''); });
ipcMain.on('flash', () => { if (win && !win.isFocused()) win.flashFrame(true); });
app.on('window-all-closed', () => app.quit());
