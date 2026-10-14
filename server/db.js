import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SEED_DB_PATH = path.join(__dirname, 'data_store.json');
const DB_PATH = process.env.VERCEL ? path.join('/tmp', 'data_store.json') : SEED_DB_PATH;

const defaultData = {
  courses: [],
  licenses: [],
  securityLogs: []
};

function readDb() {
  try {
    if (!fs.existsSync(DB_PATH)) {
      if (process.env.VERCEL && fs.existsSync(SEED_DB_PATH)) {
        try {
          fs.copyFileSync(SEED_DB_PATH, DB_PATH);
        } catch (copyErr) {
          console.warn('Could not copy seed DB to /tmp, using defaults:', copyErr);
          fs.writeFileSync(DB_PATH, JSON.stringify(defaultData, null, 2), 'utf8');
        }
      } else {
        fs.writeFileSync(DB_PATH, JSON.stringify(defaultData, null, 2), 'utf8');
      }
    }
    const raw = fs.readFileSync(DB_PATH, 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    console.error('Error reading database, creating fresh state:', err);
    return JSON.parse(JSON.stringify(defaultData));
  }
}

function writeDb(data) {
  try {
    fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2), 'utf8');
  } catch (err) {
    console.error('Error writing database:', err);
  }
}

export const db = {
  // --- Courses ---
  getCourses() {
    return readDb().courses;
  },

  getCourseById(courseId) {
    return readDb().courses.find(c => c.id === courseId);
  },

  saveCourse(course) {
    const data = readDb();
    const existingIdx = data.courses.findIndex(c => c.id === course.id);
    if (existingIdx >= 0) {
      data.courses[existingIdx] = course;
    } else {
      data.courses.unshift(course);
    }
    writeDb(data);
    return course;
  },

  // --- Licenses ---
  getLicenses() {
    return readDb().licenses;
  },

  getLicenseByKey(licenseKey) {
    return readDb().licenses.find(l => l.licenseKey.toUpperCase() === licenseKey.trim().toUpperCase());
  },

  saveLicense(license) {
    const data = readDb();
    const existingIdx = data.licenses.findIndex(l => l.licenseKey === license.licenseKey);
    if (existingIdx >= 0) {
      data.licenses[existingIdx] = license;
    } else {
      data.licenses.unshift(license);
    }
    writeDb(data);
    return license;
  },

  revokeLicense(licenseKey) {
    const data = readDb();
    const item = data.licenses.find(l => l.licenseKey === licenseKey);
    if (item) {
      item.status = 'revoked';
      writeDb(data);
    }
    return item;
  },

  resetLicenseDevice(licenseKey) {
    const data = readDb();
    const item = data.licenses.find(l => l.licenseKey === licenseKey);
    if (item) {
      item.boundHwid = null;
      item.boundIp = null;
      writeDb(data);
    }
    return item;
  },

  // --- Security Logs ---
  getLogs(limit = 100) {
    return readDb().securityLogs.slice(0, limit);
  },

  addLog(entry) {
    const data = readDb();
    const logItem = {
      id: 'log_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
      timestamp: new Date().toISOString(),
      ...entry
    };
    data.securityLogs.unshift(logItem);
    if (data.securityLogs.length > 500) {
      data.securityLogs = data.securityLogs.slice(0, 500);
    }
    writeDb(data);
    return logItem;
  },

  deleteCourse(courseId) {
    const data = readDb();
    const idx = data.courses.findIndex(c => c.id === courseId);
    if (idx >= 0) {
      const removed = data.courses.splice(idx, 1)[0];
      writeDb(data);
      return removed;
    }
    return null;
  },

  // --- Admin Authentication (Login ID, Password Hash, TOTP Secret) ---
  getAdminAuth() {
    const data = readDb();
    if (!data.adminAuth) {
      // Default initial admin credentials
      data.adminAuth = {
        loginId: 'admin',
        passwordHash: '240be518fabd2724ddb6f04eeb1da5967448d7e831c08c8fa822809f74c720a9', // sha256 of 'admin123'
        totpSecret: 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP', // 32-char Base32 seed
        totpEnabled: true,
        updatedAt: new Date().toISOString()
      };
      writeDb(data);
    }
    return data.adminAuth;
  },

  saveAdminAuth(authData) {
    const data = readDb();
    data.adminAuth = {
      ...data.adminAuth,
      ...authData,
      updatedAt: new Date().toISOString()
    };
    writeDb(data);
    return data.adminAuth;
  }
};
