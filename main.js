const { app, BrowserWindow } = require('electron');
app.whenReady().then(() => {
  const w = new BrowserWindow({ width: 1100, height: 720, minWidth: 800, minHeight: 560, autoHideMenuBar: true, title: 'Chat Frog' });
  w.loadFile('index.html');
});
app.on('window-all-closed', () => app.quit());
