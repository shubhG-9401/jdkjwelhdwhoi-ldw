import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = process.env.VERCEL ? process.cwd() : path.resolve(__dirname, '..', '..');

export const config = {
  // Environment
  env: process.env.NODE_ENV || 'development',
  isProduction: process.env.NODE_ENV === 'production',
  isVercel: !!process.env.VERCEL,

  // Server Port
  port: parseInt(process.env.PORT || '3000', 10),

  // Paths
  projectRoot,
  serverRoot: path.resolve(__dirname, '..'),

  // Storage and Database paths
  storageDir: process.env.VERCEL
    ? path.join('/tmp', 'encrypted_storage')
    : path.resolve(__dirname, '..', 'encrypted_storage'),

  dbPath: process.env.VERCEL
    ? path.join('/tmp', 'data_store.json')
    : path.resolve(__dirname, '..', 'data_store.json'),

  seedDbPath: path.resolve(__dirname, '..', 'data_store.json'),

  // Security & Authentication
  jwtSecret: process.env.ADMIN_JWT_SECRET || 'secure-drm-admin-session-secret-key-2026',
  sessionTtlMs: 24 * 60 * 60 * 1000, // 24 hours
  licenseKeyLength: 56,

  // File Upload Limits
  maxFileSize: 300 * 1024 * 1024, // 300 MB

  // Static Assets Paths
  adminPortalDir: path.join(projectRoot, 'admin-portal'),
  studentAppDir: path.join(projectRoot, 'student-app'),
  nodeModulesDir: path.join(projectRoot, 'node_modules')
};

export default config;
