import fs from 'node:fs';
import path from 'node:path';
import { config } from './config/index.js';

const DB_PATH = config.dbPath;
const SEED_DB_PATH = config.seedDbPath;

const defaultData = {
  courses: [],
  licenses: [],
  securityLogs: []
};

// In-memory cache for ultra-fast zero-latency reads & persistence across requests
let cachedData = null;
let isInitialized = false;
let initPromise = null;
let lastGithubSha = null;

/**
 * Detects the active storage provider.
 * @returns {'upstash_redis' | 'github_sync' | 'render' | 'local_persistent' | 'vercel_ephemeral'}
 */
export function getStorageProvider() {
  if (process.env.MONGODB_URI) {
    return 'mongodb';
  }
  if (
    process.env.UPSTASH_REDIS_REST_URL ||
    process.env.KV_REST_API_URL ||
    process.env.KV_URL ||
    process.env.REDIS_URL
  ) {
    return 'upstash_redis';
  }
  if (process.env.GITHUB_TOKEN) {
    return 'github_sync';
  }
  if (process.env.RENDER) {
    return 'render';
  }
  if (!config.isVercel) {
    return 'local_persistent';
  }
  return 'vercel_ephemeral';
}

/**
 * Reads local database file or seeds it from bundled repo state.
 */
function readLocalDb() {
  try {
    if (!fs.existsSync(DB_PATH)) {
      if (process.env.VERCEL && fs.existsSync(SEED_DB_PATH)) {
        try {
          fs.copyFileSync(SEED_DB_PATH, DB_PATH);
        } catch (copyErr) {
          console.warn('[DB] Could not copy seed DB to /tmp, using defaults:', copyErr.message);
          fs.writeFileSync(DB_PATH, JSON.stringify(defaultData, null, 2), 'utf8');
        }
      } else if (fs.existsSync(SEED_DB_PATH)) {
        try {
          fs.copyFileSync(SEED_DB_PATH, DB_PATH);
        } catch (copyErr) {
          fs.writeFileSync(DB_PATH, JSON.stringify(defaultData, null, 2), 'utf8');
        }
      } else {
        fs.writeFileSync(DB_PATH, JSON.stringify(defaultData, null, 2), 'utf8');
      }
    }
    const raw = fs.readFileSync(DB_PATH, 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    console.error('[DB] Error reading local database file, using fallback defaults:', err.message);
    return JSON.parse(JSON.stringify(defaultData));
  }
}

/**
 * Writes data directly to local disk/filesystem.
 */
function writeLocalDb(data) {
  try {
    fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2), 'utf8');
    // Also keep seedDbPath in sync if we are in local development
    if (!config.isVercel && fs.existsSync(path.dirname(SEED_DB_PATH)) && DB_PATH !== SEED_DB_PATH) {
      try {
        fs.writeFileSync(SEED_DB_PATH, JSON.stringify(data, null, 2), 'utf8');
      } catch (e) {}
    }
  } catch (err) {
    console.error('[DB] Error writing local database:', err.message);
  }
}

let upstashClient = null;

/**
 * Gets or initializes the Upstash Redis client using the official @upstash/redis SDK.
 */
async function getUpstashRedis() {
  if (upstashClient) return upstashClient;
  try {
    const { Redis } = await import('@upstash/redis');
    const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
    const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
    if (url && token) {
      upstashClient = new Redis({ url, token });
    } else {
      upstashClient = Redis.fromEnv();
    }
    return upstashClient;
  } catch (err) {
    console.warn('[UPSTASH] Could not initialize @upstash/redis SDK:', err.message);
    return null;
  }
}

/**
 * Fetches data from remote cloud storage (MongoDB Atlas, Upstash Redis, or GitHub API).
 */
async function fetchRemoteData() {
  const provider = getStorageProvider();

  // 1. MongoDB Atlas
  if (provider === 'mongodb') {
    try {
      const { MongoClient } = await import('mongodb');
      const client = new MongoClient(process.env.MONGODB_URI);
      await client.connect();
      const database = client.db(process.env.MONGODB_DB_NAME || 'secure_course_drm');
      const doc = await database.collection('system_store').findOne({ _id: 'primary' });
      await client.close();
      if (doc && doc.data && doc.data.courses && doc.data.licenses) {
        console.log('[DB REMOTE] Successfully hydrated data store from MongoDB Atlas.');
        return doc.data;
      }
    } catch (err) {
      console.warn('[DB REMOTE WARN] Failed to read from MongoDB Atlas:', err.message);
    }
  }

  // 2. Upstash Redis / Vercel KV
  if (provider === 'upstash_redis') {
    // A. Official @upstash/redis SDK
    try {
      const redis = await getUpstashRedis();
      if (redis) {
        const result = await redis.get('drm_data_store');
        if (result) {
          const parsed = typeof result === 'string' ? JSON.parse(result) : result;
          if (parsed && (parsed.licenses || parsed.courses)) {
            console.log('[DB REMOTE] Successfully hydrated data store from Upstash Redis via SDK.');
            return parsed;
          }
        }
      }
    } catch (sdkErr) {
      console.warn('[DB REMOTE WARN] Upstash Redis SDK read failed, attempting REST fallback:', sdkErr.message);
    }

    // B. Direct REST fallback
    const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
    const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
    if (url && token) {
      try {
        const res = await fetch(`${url}/get/drm_data_store`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (res.ok) {
          const json = await res.json();
          if (json && json.result) {
            const parsed = typeof json.result === 'string' ? JSON.parse(json.result) : json.result;
            console.log('[DB REMOTE] Successfully hydrated data store from Upstash Redis (REST).');
            return parsed;
          }
        }
      } catch (err) {
        console.warn('[DB REMOTE WARN] Failed to read from Upstash Redis:', err.message);
      }
    }
  }

  // 3. GitHub Repository API
  if (provider === 'github_sync') {
    const token = process.env.GITHUB_TOKEN;
    const repo = process.env.GITHUB_REPO || 'shubhG-9401/jdkjwelhdwhoi-ldw';
    const filePath = 'server/data_store.json';
    try {
      const res = await fetch(`https://api.github.com/repos/${repo}/contents/${filePath}`, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github.v3+json',
          'User-Agent': 'SecureDRM-Server'
        }
      });
      if (res.ok) {
        const fileData = await res.json();
        lastGithubSha = fileData.sha;
        const rawContent = Buffer.from(fileData.content, 'base64').toString('utf8');
        const parsed = JSON.parse(rawContent);
        console.log(`[DB REMOTE] Successfully hydrated data store from GitHub repo ${repo}.`);
        return parsed;
      } else {
        console.warn(`[DB REMOTE WARN] GitHub API returned status ${res.status}`);
      }
    } catch (err) {
      console.warn('[DB REMOTE WARN] Failed to read from GitHub API:', err.message);
    }
  }

  return null;
}

/**
 * Asynchronously pushes data to remote cloud storage.
 */
let isSyncing = false;
let pendingSync = false;

async function syncRemote(data) {
  const provider = getStorageProvider();
  if (provider !== 'upstash_redis' && provider !== 'github_sync' && provider !== 'mongodb') {
    return;
  }

  if (isSyncing) {
    pendingSync = true;
    return;
  }

  isSyncing = true;
  try {
    if (provider === 'mongodb') {
      const { MongoClient } = await import('mongodb');
      const client = new MongoClient(process.env.MONGODB_URI);
      await client.connect();
      const database = client.db(process.env.MONGODB_DB_NAME || 'secure_course_drm');
      await database.collection('system_store').updateOne(
        { _id: 'primary' },
        { $set: { data, updatedAt: new Date() } },
        { upsert: true }
      );
      await client.close();
      console.log('[DB REMOTE] Data store saved to MongoDB Atlas.');
    } else if (provider === 'upstash_redis') {
      let saved = false;
      try {
        const redis = await getUpstashRedis();
        if (redis) {
          await redis.set('drm_data_store', JSON.stringify(data));
          console.log('[DB REMOTE] Data store saved to Upstash Redis via SDK.');
          saved = true;
        }
      } catch (sdkErr) {
        console.warn('[DB REMOTE WARN] Upstash Redis SDK save failed, attempting REST fallback:', sdkErr.message);
      }

      if (!saved) {
        const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
        const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
        if (url && token) {
          await fetch(`${url}/set/drm_data_store`, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify(JSON.stringify(data))
          });
          console.log('[DB REMOTE] Data store saved to Upstash Redis (REST).');
        }
      }
    } else if (provider === 'github_sync') {
      const token = process.env.GITHUB_TOKEN;
      const repo = process.env.GITHUB_REPO || 'shubhG-9401/jdkjwelhdwhoi-ldw';
      const filePath = 'server/data_store.json';

      // Ensure we have current sha
      if (!lastGithubSha) {
        const getRes = await fetch(`https://api.github.com/repos/${repo}/contents/${filePath}`, {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/vnd.github.v3+json',
            'User-Agent': 'SecureDRM-Server'
          }
        });
        if (getRes.ok) {
          const f = await getRes.json();
          lastGithubSha = f.sha;
        }
      }

      const bodyPayload = {
        message: '[skip ci] sync drm database store',
        content: Buffer.from(JSON.stringify(data, null, 2), 'utf8').toString('base64'),
        sha: lastGithubSha
      };

      const putRes = await fetch(`https://api.github.com/repos/${repo}/contents/${filePath}`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github.v3+json',
          'User-Agent': 'SecureDRM-Server',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(bodyPayload)
      });

      if (putRes.ok) {
        const resData = await putRes.json();
        lastGithubSha = resData.content?.sha || lastGithubSha;
        console.log('[DB REMOTE] Data store successfully committed to GitHub repository.');
      } else {
        const errText = await putRes.text();
        console.warn('[DB REMOTE WARN] GitHub commit failed:', putRes.status, errText);
      }
    }
  } catch (err) {
    console.error('[DB REMOTE ERROR] Sync failed:', err.message);
  } finally {
    isSyncing = false;
    if (pendingSync) {
      pendingSync = false;
      syncRemote(cachedData);
    }
  }
}

/**
 * Reads database state from cache or local disk.
 */
function readDb() {
  if (cachedData) {
    return cachedData;
  }
  cachedData = readLocalDb();
  return cachedData;
}

/**
 * Writes database state to cache, local disk, and remote storage.
 */
function writeDb(data) {
  cachedData = data;
  writeLocalDb(data);
  // Asynchronously sync to cloud store without blocking synchronous call
  syncRemote(data).catch(() => {});
}

export const db = {
  /**
   * Initializes the database on server start or serverless cold start.
   */
  async init() {
    if (isInitialized) return cachedData;
    if (initPromise) return initPromise;

    initPromise = (async () => {
      try {
        const remote = await fetchRemoteData();
        if (remote && remote.courses && remote.licenses) {
          cachedData = remote;
          writeLocalDb(cachedData);
          isInitialized = true;
          return cachedData;
        }
      } catch (err) {
        console.warn('[DB] Remote init failed, falling back to local disk:', err.message);
      }

      cachedData = readLocalDb();
      isInitialized = true;

      // If connected to a cloud provider (e.g. freshly created Upstash Redis or MongoDB instance)
      // and remote database was empty, auto-seed it immediately with existing courses and licenses!
      const provider = getStorageProvider();
      if (provider === 'upstash_redis' || provider === 'mongodb') {
        syncRemote(cachedData).catch(e => console.warn('[DB AUTO-SEED WARN]', e.message));
      }

      return cachedData;
    })();

    return initPromise;
  },

  /**
   * Returns system storage status and metadata.
   */
  getSystemStatus() {
    const data = readDb();
    const provider = getStorageProvider();
    return {
      storageProvider: provider,
      isPersistent: provider !== 'vercel_ephemeral',
      isVercel: config.isVercel,
      isRender: !!process.env.RENDER,
      courseCount: (data.courses || []).length,
      licenseCount: (data.licenses || []).length,
      activeLicenses: (data.licenses || []).filter(l => l.status === 'active').length,
      logCount: (data.securityLogs || []).length,
      lastGithubSha,
      guidance: provider === 'vercel_ephemeral'
        ? 'Running on Vercel ephemeral /tmp. For permanent storage, add Upstash Redis KV in Vercel, or set GITHUB_TOKEN, or deploy to Render free.'
        : 'Storage is fully persistent and protected against restarts.'
    };
  },

  /**
   * Exports entire database as an object.
   */
  exportData() {
    return readDb();
  },

  /**
   * Restores database from imported object.
   */
  restoreData(newData) {
    if (!newData || typeof newData !== 'object') {
      throw new Error('Invalid data payload for database restore');
    }
    const data = {
      courses: Array.isArray(newData.courses) ? newData.courses : [],
      licenses: Array.isArray(newData.licenses) ? newData.licenses : [],
      securityLogs: Array.isArray(newData.securityLogs) ? newData.securityLogs : [],
      adminAuth: newData.adminAuth || readDb().adminAuth
    };
    writeDb(data);
    return data;
  },

  // --- Courses ---
  getCourses() {
    return readDb().courses || [];
  },

  getCourseById(courseId) {
    return (readDb().courses || []).find(c => c.id === courseId);
  },

  saveCourse(course) {
    const data = readDb();
    if (!data.courses) data.courses = [];
    const existingIdx = data.courses.findIndex(c => c.id === course.id);
    if (existingIdx >= 0) {
      data.courses[existingIdx] = course;
    } else {
      data.courses.unshift(course);
    }
    writeDb(data);
    return course;
  },

  deleteCourse(courseId) {
    const data = readDb();
    if (!data.courses) return null;
    const idx = data.courses.findIndex(c => c.id === courseId);
    if (idx >= 0) {
      const removed = data.courses.splice(idx, 1)[0];
      writeDb(data);
      return removed;
    }
    return null;
  },

  // --- Licenses ---
  getLicenses() {
    return readDb().licenses || [];
  },

  getLicenseByKey(licenseKey) {
    if (!licenseKey) return null;
    return (readDb().licenses || []).find(
      l => l.licenseKey && l.licenseKey.toUpperCase() === licenseKey.trim().toUpperCase()
    );
  },

  saveLicense(license) {
    const data = readDb();
    if (!data.licenses) data.licenses = [];
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
    if (!data.licenses) return null;
    const item = data.licenses.find(l => l.licenseKey === licenseKey);
    if (item) {
      item.status = 'revoked';
      writeDb(data);
    }
    return item;
  },

  resetLicenseDevice(licenseKey) {
    const data = readDb();
    if (!data.licenses) return null;
    const item = data.licenses.find(l => l.licenseKey === licenseKey);
    if (item) {
      item.boundHwid = null;
      item.boundIp = null;
      item.boundIpv4 = null;
      item.boundIpv6 = null;
      writeDb(data);
    }
    return item;
  },

  deleteLicense(licenseKey) {
    const data = readDb();
    if (!data.licenses) return null;
    const idx = data.licenses.findIndex(l => l.licenseKey === licenseKey);
    if (idx >= 0) {
      const removed = data.licenses.splice(idx, 1)[0];
      writeDb(data);
      return removed;
    }
    return null;
  },

  // --- Security Logs ---
  getLogs(limit = 100) {
    const rawLogs = (readDb().securityLogs || []).slice(0, limit);
    return rawLogs.map(l => {
      let v4 = l.ipv4;
      let v6 = l.ipv6;
      if (!v4 || !v6) {
        const raw = String(l.ip || '');
        if (raw.includes('/')) {
          const parts = raw.split('/').map(s => s.trim());
          for (const p of parts) {
            if (p.includes(':') && !v6) v6 = p;
            else if (p.includes('.') && !v4) v4 = p;
          }
        } else if (raw.includes(':') && !v6) {
          v6 = raw;
        } else if (raw.includes('.') && !v4) {
          v4 = raw;
        }
      }

      // If IPv4 is an external/remote IP and IPv6 was assigned loopback ::1, sanitize to null
      if (v4 && v4 !== '127.0.0.1' && v6 === '::1') {
        v6 = null;
      }

      return {
        ...l,
        ipv4: v4 || null,
        ipv6: v6 || null
      };
    });
  },

  addLog(entry) {
    const data = readDb();
    if (!data.securityLogs) data.securityLogs = [];

    let ipv4 = entry.ipv4;
    let ipv6 = entry.ipv6;
    if (!ipv4 || !ipv6) {
      if (typeof entry.ip === 'string') {
        const parts = entry.ip.split('/').map(s => s.trim());
        for (const p of parts) {
          if (p.includes(':') && !ipv6) ipv6 = p;
          else if (p.includes('.') && !ipv4) ipv4 = p;
        }
      }
    }

    if (ipv4 && ipv4 !== '127.0.0.1' && ipv6 === '::1') {
      ipv6 = null;
    }

    const logItem = {
      id: 'log_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
      timestamp: new Date().toISOString(),
      ...entry,
      ipv4: ipv4 || null,
      ipv6: ipv6 || null,
      ip: entry.ip || (ipv6 ? `${ipv4 || '127.0.0.1'} / ${ipv6}` : (ipv4 || '127.0.0.1'))
    };
    data.securityLogs.unshift(logItem);
    if (data.securityLogs.length > 500) {
      data.securityLogs = data.securityLogs.slice(0, 500);
    }
    writeDb(data);
    return logItem;
  },

  updateLogIpv6(logId, ipv6) {
    const data = readDb();
    if (!data.securityLogs) return null;
    const log = data.securityLogs.find(l => l.id === logId);
    if (log) {
      log.ipv6 = ipv6;
      if (log.ipv4) {
        log.ip = `${log.ipv4} / ${ipv6}`;
      } else {
        log.ip = ipv6;
      }
      writeDb(data);
      return log;
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
