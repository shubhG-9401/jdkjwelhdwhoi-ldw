import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('desktopBridge', {
  isDesktopApp: true,
  getHwid: () => ipcRenderer.invoke('get-hwid'),
  decryptBundle: (data) => ipcRenderer.invoke('decrypt-bundle', data)
});
