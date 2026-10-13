import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import os from 'node:os';
import crypto from 'node:crypto';
import { execSync } from 'node:child_process';
import { decryptCourseBundle } from '../server/cryptoEngine.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let mainWindow = null;

// Generate unique, stable Hardware ID (HWID) for this Windows PC
function getMachineHwid() {
  try {
    if (process.platform === 'win32') {
      // Query Windows Computer UUID
      const output = execSync('powershell "(Get-CimInstance -Class Win32_ComputerSystemProduct).UUID"', { encoding: 'utf8' }).trim();
      if (output && output.length > 8) {
        return crypto.createHash('sha256').update(output).digest('hex').slice(0, 16).toUpperCase();
      }
    }
  } catch (e) {
    console.warn('Could not query Windows UUID, falling back to CPU/Network hash:', e.message);
  }

  // Cross-platform fallback: Hash of CPU model + first MAC address
  const networkInterfaces = os.networkInterfaces();
  let mac = '';
  for (const name of Object.keys(networkInterfaces)) {
    for (const net of networkInterfaces[name]) {
      if (!net.internal && net.mac && net.mac !== '00:00:00:00:00:00') {
        mac = net.mac;
        break;
      }
    }
    if (mac) break;
  }

  const seed = `${os.cpus()[0]?.model || 'cpu'}-${mac || 'pc'}-${os.hostname()}`;
  return crypto.createHash('sha256').update(seed).digest('hex').slice(0, 16).toUpperCase();
}

const MACHINE_HWID = getMachineHwid();

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1000,
    minHeight: 650,
    backgroundColor: '#020617',
    title: 'Secure Course Player - Desktop Edition',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: true,
      devTools: false // Completely disabled DevTools
    }
  });

  // Remove window menu bar entirely
  mainWindow.setMenu(null);

  // Load the LMS player interface
  mainWindow.loadFile(path.join(__dirname, 'index.html'));

  // Immediately close DevTools if triggered by any external mechanism
  mainWindow.webContents.on('devtools-opened', () => {
    mainWindow.webContents.closeDevTools();
  });

  // Anti-tamper: Block saving page, inspect shortcuts, and DevTools keys
  mainWindow.webContents.on('before-input-event', (event, input) => {
    const key = input.key.toLowerCase();
    if (
      key === 'f12' ||
      (input.control && input.shiftKey && (key === 'i' || key === 'j' || key === 'c')) ||
      (input.control && (key === 'u' || key === 's' || key === 'p' || key === 'r'))
    ) {
      event.preventDefault(); // Block Inspect, View Source, Save, Print
    }
  });

  // Block right-click context menu in Electron
  mainWindow.webContents.on('context-menu', (e) => {
    e.preventDefault();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// IPC Handlers
ipcMain.handle('get-hwid', () => {
  return MACHINE_HWID;
});

ipcMain.handle('decrypt-bundle', async (event, { bufferArray, keyHex }) => {
  try {
    const encryptedBuffer = Buffer.from(bufferArray);
    const result = decryptCourseBundle(encryptedBuffer, keyHex);

    // Transform Map of files to serializable object
    const serializableFiles = {};
    for (const [filename, fileBuffer] of result.files.entries()) {
      serializableFiles[filename] = fileBuffer;
    }

    return {
      success: true,
      manifest: result.manifest,
      files: serializableFiles
    };
  } catch (err) {
    return {
      success: false,
      error: err.message
    };
  }
});

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
