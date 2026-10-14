import express from 'express';
import cors from 'cors';
import multer from 'multer';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';
import os from 'node:os';
import { db } from './db.js';
import {
  generateRandomKey,
  encryptCourseBundle,
  inspectEncryptedFile,
  decryptCourseBundle
} from './cryptoEngine.js';
import { parseCourseDocumentText, extractTextFromBuffer } from './docParser.js';
import {
  generateSecret,
  generateOtpAuthUri,
  generateQrCodeDataUrl,
  generateTotp,
  verifyTotp
} from './totp.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = process.env.VERCEL ? process.cwd() : path.resolve(__dirname, '..');

const app = express();
const PORT = process.env.PORT || 3000;

// Stateless & Persistent Admin Session Management (HMAC-SHA256)
const JWT_SECRET = process.env.ADMIN_JWT_SECRET || 'secure-drm-admin-session-secret-key-2026';
const adminSessions = new Map();

function createAdminToken(loginId) {
  const payload = {
    loginId,
    createdAt: Date.now(),
    expiresAt: Date.now() + 24 * 60 * 60 * 1000 // 24 hours
  };
  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', JWT_SECRET).update(payloadB64).digest('base64url');
  return `${payloadB64}.${sig}`;
}

function verifyAdminToken(token) {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [payloadB64, sig] = parts;
  const expectedSig = crypto.createHmac('sha256', JWT_SECRET).update(payloadB64).digest('base64url');
  if (sig !== expectedSig) return null;
  try {
    const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
    if (Date.now() > payload.expiresAt) return null;
    return payload;
  } catch (e) {
    return null;
  }
}

function requireAdminAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized: Admin authentication required.' });
  }
  const token = authHeader.substring(7).trim();
  const session = verifyAdminToken(token) || adminSessions.get(token);
  if (!session || Date.now() > session.expiresAt) {
    if (session) adminSessions.delete(token);
    return res.status(401).json({ error: 'Unauthorized: Session expired or invalid.' });
  }
  req.adminSession = session;
  next();
}

// Storage directories
const STORAGE_DIR = process.env.VERCEL ? path.join('/tmp', 'encrypted_storage') : path.join(__dirname, 'encrypted_storage');
if (!fs.existsSync(STORAGE_DIR)) {
  try {
    fs.mkdirSync(STORAGE_DIR, { recursive: true });
  } catch (e) {
    console.warn('Could not create STORAGE_DIR:', e);
  }
}

// Helper to safely locate course encrypted files across Windows and Vercel/Linux environments
export function getCourseFilePath(course) {
  if (!course) return null;
  const candidates = [
    course.encryptedFilePath,
    path.join(STORAGE_DIR, course.encryptedFileName || `${course.id}.enc`),
    path.join(__dirname, 'encrypted_storage', course.encryptedFileName || `${course.id}.enc`),
    path.join(projectRoot, course.encryptedFileName || `${course.id}.enc`),
    path.join(projectRoot, 'server', 'encrypted_storage', course.encryptedFileName || `${course.id}.enc`)
  ];
  for (const p of candidates) {
    if (p && fs.existsSync(p)) return p;
  }
  return path.join(STORAGE_DIR, course.encryptedFileName || `${course.id}.enc`);
}

// Multer in-memory storage for handling files securely before encryption
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 300 * 1024 * 1024 } // 300MB
});

app.use(cors());
app.use(express.json({ limit: '60mb' }));
app.use(express.urlencoded({ extended: true, limit: '60mb' }));

// Helper to extract both IPv4 and IPv6
function getClientIps(req) {
  let rawHeader = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1';
  let ips = [];
  if (typeof rawHeader === 'string') {
    ips = rawHeader.split(',').map(s => s.trim());
  } else if (Array.isArray(rawHeader)) {
    ips = rawHeader;
  }

  let ipv4 = null;
  let ipv6 = null;

  for (const rawIp of ips) {
    let clean = rawIp;
    if (clean.startsWith('::ffff:')) {
      clean = clean.substring(7);
    }

    if (clean === '::1' || clean === '127.0.0.1') {
      if (!ipv4) ipv4 = '127.0.0.1';
      if (!ipv6) ipv6 = '::1';
    } else if (clean.includes('.')) {
      if (!ipv4) ipv4 = clean;
    } else if (clean.includes(':')) {
      if (!ipv6) ipv6 = clean;
    }
  }

  return {
    ipv4: ipv4 || '127.0.0.1',
    ipv6: ipv6 || '::1',
    combined: `${ipv4 || '127.0.0.1'}`
  };
}

/**
 * Generates a high-entropy 56-character license key.
 * Format: 56 characters (alphanumeric uppercase)
 */
function generate56CharLicenseKey() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = crypto.randomBytes(56);
  let key = '';
  for (let i = 0; i < 56; i++) {
    key += chars[bytes[i] % chars.length];
  }
  return key;
}

// Serve Admin Portal UI
app.use('/admin', express.static(path.join(projectRoot, 'admin-portal')));

// Serve Student Player Web App
app.use('/student', express.static(path.join(projectRoot, 'student-app')));
app.use('/node_modules', express.static(path.join(projectRoot, 'node_modules')));

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'online', timestamp: new Date().toISOString() });
});

// -------------------------------------------------------------
// ADMIN AUTHENTICATION & TOTP 2FA APIS
// -------------------------------------------------------------

// Check Admin session status
app.get('/api/admin/auth/status', (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.json({ authenticated: false });
  }
  const token = authHeader.substring(7).trim();
  const session = verifyAdminToken(token) || adminSessions.get(token);
  if (!session || Date.now() > session.expiresAt) {
    if (session) adminSessions.delete(token);
    return res.json({ authenticated: false });
  }
  const auth = db.getAdminAuth();
  res.json({ authenticated: true, loginId: auth.loginId });
});

// Get current TOTP setup info (QR code data URL & secret key for pairing authenticator)
app.get('/api/admin/auth/setup-info', requireAdminAuth, async (req, res) => {
  try {
    const auth = db.getAdminAuth();
    const uri = generateOtpAuthUri(auth.loginId, auth.totpSecret);
    const qrCode = await generateQrCodeDataUrl(uri);
    res.json({
      success: true,
      loginId: auth.loginId,
      secret: auth.totpSecret,
      otpAuthUri: uri,
      qrCodeDataUrl: qrCode
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to generate setup info: ' + err.message });
  }
});

// Admin Login with 2FA Authenticator
app.post('/api/admin/auth/login', (req, res) => {
  try {
    const { loginId, password, totpToken } = req.body;
    if (!loginId || !password || !totpToken) {
      return res.status(400).json({ error: 'Login ID, Password, and 6-digit Authenticator Code are all required.' });
    }

    const auth = db.getAdminAuth();
    if (loginId.trim() !== auth.loginId) {
      db.addLog({
        action: 'admin_login_failed',
        status: 'rejected_invalid_credentials',
        message: `Admin login failed: Invalid username "${loginId}".`
      });
      return res.status(401).json({ error: 'Invalid Login ID or Password.' });
    }

    const inputHash = crypto.createHash('sha256').update(password).digest('hex');
    if (inputHash !== auth.passwordHash) {
      db.addLog({
        action: 'admin_login_failed',
        status: 'rejected_invalid_credentials',
        message: `Admin login failed: Incorrect password for "${loginId}".`
      });
      return res.status(401).json({ error: 'Invalid Login ID or Password.' });
    }

    // Verify 6-digit TOTP token against current authenticator secret
    const isTotpValid = verifyTotp(totpToken, auth.totpSecret, 1);
    if (!isTotpValid) {
      db.addLog({
        action: 'admin_login_failed',
        status: 'rejected_invalid_totp',
        message: `Admin login failed: Invalid or expired 6-digit code (${totpToken}).`
      });
      return res.status(401).json({ error: 'Invalid or expired 6-digit Authenticator Code. Check your Authenticator app.' });
    }

    // Generate Admin Session Token (stateless HMAC-SHA256 valid 24 hours)
    const token = createAdminToken(auth.loginId);
    adminSessions.set(token, {
      loginId: auth.loginId,
      createdAt: Date.now(),
      expiresAt: Date.now() + 24 * 60 * 60 * 1000
    });

    db.addLog({
      action: 'admin_login_success',
      status: 'granted',
      message: `Admin "${auth.loginId}" logged in successfully with 2FA verification.`
    });

    res.json({
      success: true,
      token,
      loginId: auth.loginId
    });
  } catch (err) {
    res.status(500).json({ error: 'Login error: ' + err.message });
  }
});

// Admin Logout
app.post('/api/admin/auth/logout', (req, res) => {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7).trim();
    adminSessions.delete(token);
  }
  res.json({ success: true, message: 'Logged out successfully.' });
});

// Generate fresh candidate TOTP secret & QR code (for re-pairing 2FA)
app.get('/api/admin/auth/generate-new-secret', requireAdminAuth, async (req, res) => {
  try {
    const auth = db.getAdminAuth();
    const newSecret = generateSecret();
    const uri = generateOtpAuthUri(auth.loginId, newSecret);
    const qrCode = await generateQrCodeDataUrl(uri);
    res.json({
      success: true,
      secret: newSecret,
      otpAuthUri: uri,
      qrCodeDataUrl: qrCode
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to generate new secret: ' + err.message });
  }
});

// Update Admin Credentials (Change Login ID, Password, and/or TOTP Secret)
app.post('/api/admin/auth/update-credentials', requireAdminAuth, async (req, res) => {
  try {
    const { newLoginId, currentPassword, newPassword, newTotpSecret, totpVerificationCode } = req.body;
    const auth = db.getAdminAuth();

    if (!currentPassword) {
      return res.status(400).json({ error: 'Current password is required to save security changes.' });
    }

    const currentHash = crypto.createHash('sha256').update(currentPassword).digest('hex');
    if (currentHash !== auth.passwordHash) {
      return res.status(401).json({ error: 'Current password verification failed. Please enter the correct current password.' });
    }

    const updates = {};

    // 1. Change Login ID
    if (newLoginId && newLoginId.trim() && newLoginId.trim() !== auth.loginId) {
      updates.loginId = newLoginId.trim();
    }

    // 2. Change Password
    if (newPassword && newPassword.trim()) {
      if (newPassword.trim().length < 6) {
        return res.status(400).json({ error: 'New password must be at least 6 characters long.' });
      }
      updates.passwordHash = crypto.createHash('sha256').update(newPassword.trim()).digest('hex');
    }

    // 3. Change / Re-pair TOTP Secret
    if (newTotpSecret && newTotpSecret.trim() && newTotpSecret.trim() !== auth.totpSecret) {
      if (!totpVerificationCode) {
        return res.status(400).json({ error: 'Please enter the 6-digit code from your authenticator app to verify the new key before saving.' });
      }
      const isNewValid = verifyTotp(totpVerificationCode, newTotpSecret.trim(), 1);
      if (!isNewValid) {
        return res.status(400).json({ error: 'Verification code did not match the new secret. Ensure you scanned the new QR code in your Authenticator app.' });
      }
      updates.totpSecret = newTotpSecret.trim();
    }

    const updated = db.saveAdminAuth(updates);

    if (req.adminSession && updates.loginId) {
      req.adminSession.loginId = updates.loginId;
    }

    db.addLog({
      action: 'admin_security_updated',
      status: 'granted',
      message: `Admin security updated: Login ID "${updated.loginId}", Password ${newPassword ? 'changed' : 'unchanged'}, TOTP ${newTotpSecret ? 're-paired' : 'unchanged'}.`
    });

    res.json({
      success: true,
      message: 'Admin security settings updated successfully.',
      loginId: updated.loginId
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update credentials: ' + err.message });
  }
});

// -------------------------------------------------------------
// COURSE MANAGEMENT & ENCRYPTION APIS
// -------------------------------------------------------------

// Preview parsed course from text or uploaded doc
app.post('/api/admin/courses/preview-doc', requireAdminAuth, upload.single('docFile'), async (req, res) => {
  try {
    let text = req.body.docText || '';
    if (req.file && req.file.buffer) {
      text = await extractTextFromBuffer(req.file.buffer, req.file.originalname);
    }

    if (!text.trim()) {
      return res.status(400).json({ error: 'No document text or file provided.' });
    }

    const parsed = parseCourseDocumentText(text);
    res.json({
      success: true,
      courseName: parsed.courseName,
      moduleCount: parsed.modules.length,
      modules: parsed.modules,
      rawTextLength: text.length
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to parse document: ' + err.message });
  }
});

// List all courses
app.get('/api/admin/courses', (req, res) => {
  const courses = db.getCourses();
  res.json({ success: true, courses });
});

// Download an encrypted .enc file
app.get('/api/admin/courses/:courseId/download', (req, res) => {
  const course = db.getCourseById(req.params.courseId);
  if (!course) {
    return res.status(404).json({ error: 'Course not found.' });
  }
  const filePath = getCourseFilePath(course);
  if (!filePath || !fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'Encrypted course file not found on disk.' });
  }

  res.setHeader('Content-Disposition', `attachment; filename="${course.encryptedFileName}"`);
  res.setHeader('Content-Type', 'application/octet-stream');
  fs.createReadStream(filePath).pipe(res);
});

// Create & Encrypt Course Package (from Doc file, Text paste, or media assets)
app.post('/api/admin/courses/encrypt', requireAdminAuth, upload.any(), async (req, res) => {
  try {
    let { title, description, courseDocText, syllabusJson } = req.body;
    const uploadedFiles = req.files || [];

    let syllabus = [];
    let detectedCourseName = '';

    // Check if a doc/docx/txt file was uploaded
    const docFile = uploadedFiles.find(f => {
      const ext = path.extname(f.originalname).toLowerCase();
      return ['.docx', '.txt', '.doc', '.md'].includes(ext);
    });

    if (docFile) {
      const extractedText = await extractTextFromBuffer(docFile.buffer, docFile.originalname);
      const parsed = parseCourseDocumentText(extractedText);
      detectedCourseName = parsed.courseName;
      syllabus = parsed.modules;
    } else if (courseDocText && courseDocText.trim()) {
      // Direct pasted syllabus text (like Sigma 12)
      const parsed = parseCourseDocumentText(courseDocText);
      detectedCourseName = parsed.courseName;
      syllabus = parsed.modules;
    } else if (syllabusJson) {
      try {
        syllabus = JSON.parse(syllabusJson);
      } catch (e) {
        syllabus = [];
      }
    }

    if (!title || title.trim() === '') {
      title = detectedCourseName || 'Untitled Encrypted Course';
    }

    // Media asset files (MP4, PDF, notes) to package in-memory
    const packagedFiles = [];

    // If no document syllabus was supplied, assemble from files
    if (syllabus.length === 0) {
      const lessons = uploadedFiles.map((file, idx) => {
        const ext = path.extname(file.originalname).toLowerCase();
        let type = 'doc';
        if (['.mp4', '.webm', '.mkv', '.mov'].includes(ext)) type = 'video';
        else if (ext === '.pdf') type = 'pdf';

        const safeFilename = `file_${Date.now()}_${idx}_${file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
        packagedFiles.push({
          filename: safeFilename,
          buffer: file.buffer
        });

        return {
          id: `lesson_${idx + 1}`,
          title: file.originalname.replace(/\.[^/.]+$/, ''),
          type,
          filename: safeFilename,
          size: file.size
        };
      });

      syllabus = [{
        moduleTitle: 'Module 1: Course Content',
        lessons
      }];
    } else {
      // Attach any uploaded media files alongside syllabus links
      for (const file of uploadedFiles) {
        const ext = path.extname(file.originalname).toLowerCase();
        if (!['.docx', '.doc', '.txt'].includes(ext)) {
          const safeFilename = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
          packagedFiles.push({
            filename: safeFilename,
            buffer: file.buffer
          });
        }
      }
    }

    const courseId = 'crs_' + crypto.randomBytes(6).toString('hex');
    const encryptionKeyHex = generateRandomKey(); // 256-bit random AES key

    const manifest = {
      courseId,
      title,
      description: description || '',
      createdAt: new Date().toISOString(),
      modules: syllabus
    };

    // Encrypt syllabus + files into the authenticated .enc binary format
    const encryptedBuffer = encryptCourseBundle(courseId, encryptionKeyHex, manifest, packagedFiles);

    const safeTitle = title.toLowerCase().replace(/[^a-z0-9]+/g, '_');
    const encryptedFileName = `${safeTitle}_${courseId}.enc`;
    const encryptedFilePath = path.join(STORAGE_DIR, encryptedFileName);

    fs.writeFileSync(encryptedFilePath, encryptedBuffer);

    // Save course record with encryption key in database
    const courseRecord = {
      id: courseId,
      title,
      description: description || '',
      encryptedFileName,
      encryptedFilePath,
      fileSize: encryptedBuffer.length,
      moduleCount: syllabus.length,
      fileCount: packagedFiles.length,
      encryptionKeyHex, // Master AES key held securely on server
      manifest,
      createdAt: new Date().toISOString()
    };

    db.saveCourse(courseRecord);

    db.addLog({
      action: 'course_encrypted',
      status: 'granted',
      courseId,
      message: `Course "${title}" encrypted (${syllabus.length} modules, ${(encryptedBuffer.length / (1024 * 1024)).toFixed(2)} MB).`
    });

    res.json({
      success: true,
      course: {
        id: courseId,
        title,
        encryptedFileName,
        fileSize: encryptedBuffer.length,
        moduleCount: syllabus.length,
        downloadUrl: `/api/admin/courses/${courseId}/download`
      }
    });
  } catch (err) {
    console.error('Course encryption failed:', err);
    res.status(500).json({ error: 'Failed to encrypt course package: ' + err.message });
  }
});

// Update an existing course (Add/Remove lessons or modules, and re-encrypt preserving key)
app.put('/api/admin/courses/:courseId', requireAdminAuth, (req, res) => {
  try {
    const { courseId } = req.params;
    const { title, description, modules } = req.body;

    const course = db.getCourseById(courseId);
    if (!course) {
      return res.status(404).json({ error: 'Course not found.' });
    }

    if (!Array.isArray(modules)) {
      return res.status(400).json({ error: 'Modules array is required.' });
    }

    // Keep the existing encryption key so existing student licenses stay 100% valid!
    const encryptionKeyHex = course.encryptionKeyHex;

    const updatedManifest = {
      courseId,
      title: title || course.title,
      description: description !== undefined ? description : course.description,
      createdAt: course.manifest?.createdAt || course.createdAt,
      updatedAt: new Date().toISOString(),
      modules
    };

    // Re-encrypt the container with the existing master key
    const encryptedBuffer = encryptCourseBundle(courseId, encryptionKeyHex, updatedManifest, []);

    // Write back to encrypted file path
    const targetFilePath = getCourseFilePath(course);
    try {
      fs.writeFileSync(targetFilePath, encryptedBuffer);
    } catch (writeErr) {
      console.warn('Could not write updated package to target path, trying STORAGE_DIR:', writeErr);
      try {
        fs.writeFileSync(path.join(STORAGE_DIR, course.encryptedFileName), encryptedBuffer);
      } catch (e2) {}
    }

    // If root copy exists (e.g. sigma_12_encrypted.enc), update it as well
    const rootCopy = path.join(projectRoot, course.encryptedFileName);
    if (fs.existsSync(rootCopy) || course.id === 'crs_sigma12') {
      try { fs.writeFileSync(rootCopy, encryptedBuffer); } catch (e) {}
    }
    // Also update Downloads folder if Sigma 12
    const dlCopy = path.join('C:\\Users\\Lenovo\\Downloads', course.encryptedFileName);
    if (fs.existsSync(dlCopy) || course.id === 'crs_sigma12') {
      try { fs.writeFileSync(dlCopy, encryptedBuffer); } catch (e) {}
    }

    course.title = updatedManifest.title;
    course.description = updatedManifest.description;
    course.manifest = updatedManifest;
    course.fileSize = encryptedBuffer.length;
    course.moduleCount = modules.length;
    course.updatedAt = new Date().toISOString();

    db.saveCourse(course);

    db.addLog({
      action: 'course_updated',
      status: 'granted',
      courseId,
      message: `Course "${course.title}" content updated. Modules: ${modules.length}, Total Size: ${course.fileSize} bytes. Re-encrypted with active master key.`
    });

    res.json({
      success: true,
      message: 'Course updated and re-encrypted successfully.',
      course
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update course: ' + err.message });
  }
});

// Delete an existing course
app.delete('/api/admin/courses/:courseId', requireAdminAuth, (req, res) => {
  try {
    const { courseId } = req.params;
    const removed = db.deleteCourse(courseId);
    if (!removed) {
      return res.status(404).json({ error: 'Course not found.' });
    }

    const targetFilePath = getCourseFilePath(removed);
    if (targetFilePath && fs.existsSync(targetFilePath)) {
      try { fs.unlinkSync(targetFilePath); } catch (e) {}
    }

    db.addLog({
      action: 'course_deleted',
      status: 'granted',
      courseId,
      message: `Course "${removed.title}" (${courseId}) was deleted by administrator.`
    });

    res.json({ success: true, message: `Course "${removed.title}" deleted successfully.` });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete course: ' + err.message });
  }
});

// Create a new Customer License with 56-Character Key and IPv4 / IPv6 Binding
app.post('/api/admin/licenses', requireAdminAuth, (req, res) => {
  try {
    const {
      courseId,
      customerName,
      customerEmail,
      ipLockMode = 'first_login', // 'first_login' | 'strict'
      allowedIpv4 = null,
      allowedIpv6 = null,
      customLicenseKey = null
    } = req.body;

    if (!courseId || !customerName) {
      return res.status(400).json({ error: 'Course ID and Customer Name are required.' });
    }

    const course = db.getCourseById(courseId);
    if (!course) {
      return res.status(404).json({ error: 'Selected course not found.' });
    }

    // Generate or use exactly 56-character license key
    let licenseKey = (customLicenseKey || '').trim().toUpperCase();
    if (!licenseKey || licenseKey.length !== 56) {
      licenseKey = generate56CharLicenseKey(); // Exactly 56 characters
    }

    const newLicense = {
      licenseKey, // 56 characters long
      keyLength: licenseKey.length,
      courseId,
      courseTitle: course.title,
      customerName,
      customerEmail: customerEmail || '',
      ipLockMode, // 'first_login' or 'strict'
      allowedIpv4: ipLockMode === 'strict' ? (allowedIpv4 || '').trim() : null,
      allowedIpv6: ipLockMode === 'strict' ? (allowedIpv6 || '').trim() : null,
      boundIpv4: null,
      boundIpv6: null,
      boundHwid: null,
      status: 'active',
      createdAt: new Date().toISOString(),
      activatedAt: null,
      lastAccessAt: null
    };

    db.saveLicense(newLicense);

    db.addLog({
      action: 'license_generated',
      status: 'granted',
      licenseKey,
      studentName: customerName,
      courseId,
      message: `Generated 56-character license for ${customerName} (IP Mode: ${ipLockMode}).`
    });

    res.json({ success: true, license: newLicense });
  } catch (err) {
    res.status(500).json({ error: 'Failed to generate license: ' + err.message });
  }
});

// List all licenses
app.get('/api/admin/licenses', requireAdminAuth, (req, res) => {
  const licenses = db.getLicenses();
  res.json({ success: true, licenses });
});

// Revoke a license
app.post('/api/admin/licenses/:licenseKey/revoke', requireAdminAuth, (req, res) => {
  const license = db.revokeLicense(req.params.licenseKey);
  if (!license) {
    return res.status(404).json({ error: 'License not found.' });
  }

  db.addLog({
    action: 'license_revoked',
    status: 'granted',
    licenseKey: license.licenseKey,
    studentName: license.customerName,
    message: `License ${license.licenseKey} revoked by administrator.`
  });

  res.json({ success: true, license });
});

// Reset Hardware ID / IP lock for a customer
app.post('/api/admin/licenses/:licenseKey/reset-device', requireAdminAuth, (req, res) => {
  const license = db.resetLicenseDevice(req.params.licenseKey);
  if (!license) {
    return res.status(404).json({ error: 'License not found.' });
  }

  // Clear dual-stack IPs
  license.boundIpv4 = null;
  license.boundIpv6 = null;
  license.boundHwid = null;
  db.saveLicense(license);

  db.addLog({
    action: 'device_reset',
    status: 'granted',
    licenseKey: license.licenseKey,
    studentName: license.customerName,
    message: `Reset device HWID and IPv4/IPv6 binding for ${license.customerName}.`
  });

  res.json({ success: true, license });
});

// Security & Access Audit Logs
app.get('/api/admin/logs', requireAdminAuth, (req, res) => {
  const logs = db.getLogs();
  res.json({ success: true, logs });
});

// -------------------------------------------------------------
// DRM STUDENT CLIENT VERIFICATION APIS
// -------------------------------------------------------------

// Inspect encrypted file header
app.post('/api/client/inspect-file', upload.single('encFile'), (req, res) => {
  try {
    if (!req.file || !req.file.buffer) {
      return res.status(400).json({ error: 'No encrypted file provided.' });
    }
    const meta = inspectEncryptedFile(req.file.buffer);
    const course = db.getCourseById(meta.keyId);

    res.json({
      success: true,
      keyId: meta.keyId,
      courseTitle: course ? course.title : 'Encrypted Course Package',
      totalSize: meta.totalSize,
      isValidContainer: true
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Verify License and Activate Session (Dual IPv4 & IPv6 + HWID enforcement)
app.post('/api/client/activate', (req, res) => {
  try {
    const { licenseKey, hwid, keyId, clientIpv4, clientIpv6 } = req.body;
    const reqIps = getClientIps(req);
    const effectiveIpv4 = clientIpv4 || reqIps.ipv4;
    const effectiveIpv6 = clientIpv6 || reqIps.ipv6;

    if (!licenseKey || !hwid) {
      return res.status(400).json({ error: 'License key and Device Hardware ID (HWID) are required.' });
    }

    // Enforce 56-character license key length check
    const cleanKey = licenseKey.trim().toUpperCase();
    if (cleanKey.length !== 56) {
      return res.status(400).json({
        error: `Invalid License Key length (${cleanKey.length} chars). License keys must be exactly 56 characters long.`
      });
    }

    // Check if client is on a mobile device (strictly reject mobile activation)
    const userAgent = req.headers['user-agent'] || '';
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Mobile|mobile|CriOS/i.test(userAgent);
    if (isMobile) {
      db.addLog({
        action: 'activation_attempt',
        status: 'rejected_mobile_device',
        licenseKey: cleanKey || 'UNKNOWN',
        ip: `${effectiveIpv4} / ${effectiveIpv6}`,
        hwid,
        message: `Blocked activation attempt from mobile device (${userAgent.substring(0, 80)}). Course playback is restricted to Windows PC.`
      });
      return res.status(403).json({
        error: 'ACCESS RESTRICTED: Course playback is strictly permitted on Windows PC / Desktop. Mobile devices and tablets are not authorized.'
      });
    }

    const license = db.getLicenseByKey(cleanKey);
    if (!license) {
      db.addLog({
        action: 'activation_attempt',
        status: 'rejected_invalid_key',
        licenseKey: cleanKey,
        ip: `${effectiveIpv4} / ${effectiveIpv6}`,
        hwid,
        message: 'Attempted activation with non-existent 56-char license key.'
      });
      return res.status(401).json({ error: 'Invalid or non-existent 56-character license key.' });
    }

    if (license.status === 'revoked') {
      db.addLog({
        action: 'activation_attempt',
        status: 'rejected_revoked',
        licenseKey: cleanKey,
        studentName: license.customerName,
        ip: `${effectiveIpv4} / ${effectiveIpv6}`,
        hwid,
        message: 'Attempted access with revoked license.'
      });
      return res.status(403).json({ error: 'This license has been REVOKED by the administrator.' });
    }

    // Check course match if keyId was provided
    if (keyId && license.courseId !== keyId) {
      db.addLog({
        action: 'activation_attempt',
        status: 'rejected_course_mismatch',
        licenseKey: cleanKey,
        studentName: license.customerName,
        ip: `${effectiveIpv4} / ${effectiveIpv6}`,
        hwid,
        message: `License is for course ${license.courseId}, but user opened ${keyId}.`
      });
      return res.status(403).json({ error: 'This license key is not valid for this specific course file.' });
    }

    const course = db.getCourseById(license.courseId);
    if (!course) {
      return res.status(404).json({ error: 'Associated course record could not be found.' });
    }

    // --- 1. IP Validation (Single-IP with Dual-Stack IPv4 / IPv6) ---
    if (license.ipLockMode === 'strict') {
      const matchV4 = license.allowedIpv4 && (license.allowedIpv4 === effectiveIpv4);
      const matchV6 = license.allowedIpv6 && (license.allowedIpv6 === effectiveIpv6);
      
      if (!matchV4 && !matchV6) {
        db.addLog({
          action: 'activation_attempt',
          status: 'rejected_ip_mismatch',
          licenseKey: cleanKey,
          studentName: license.customerName,
          ip: `${effectiveIpv4} / ${effectiveIpv6}`,
          hwid,
          message: `Blocked: Strict IP Mismatch. Allowed: ${license.allowedIpv4 || license.allowedIpv6}, Detected: IPv4=${effectiveIpv4}, IPv6=${effectiveIpv6}`
        });
        return res.status(403).json({
          error: `Access Denied: Your IP (IPv4: ${effectiveIpv4}, IPv6: ${effectiveIpv6}) is not authorized for this license.`
        });
      }
    } else {
      // 'first_login' auto-binding mode: bind both IPv4 and IPv6 on initial activation
      if (!license.boundIpv4 && !license.boundIpv6) {
        license.boundIpv4 = effectiveIpv4;
        license.boundIpv6 = effectiveIpv6;
      } else {
        const matchesV4 = license.boundIpv4 && (license.boundIpv4 === effectiveIpv4);
        const matchesV6 = license.boundIpv6 && (license.boundIpv6 === effectiveIpv6);

        // If neither IPv4 nor IPv6 matches, block sharing!
        if (!matchesV4 && !matchesV6) {
          db.addLog({
            action: 'activation_attempt',
            status: 'rejected_ip_mismatch',
            licenseKey: cleanKey,
            studentName: license.customerName,
            ip: `${effectiveIpv4} / ${effectiveIpv6}`,
            hwid,
            message: `Blocked: IP Mismatch. Bound to: ${license.boundIpv4 || license.boundIpv6}, Detected: IPv4=${effectiveIpv4}, IPv6=${effectiveIpv6}`
          });
          return res.status(403).json({
            error: `Access Denied: This license is locked to another network (Bound IPv4: ${license.boundIpv4 || 'none'}, IPv6: ${license.boundIpv6 || 'none'}). Cannot be accessed from other locations.`
          });
        }
      }
    }

    // --- 2. Device Hardware ID (HWID) Validation ---
    if (!license.boundHwid) {
      license.boundHwid = hwid; // Lock to student's initial PC device
    } else if (license.boundHwid !== hwid) {
      db.addLog({
        action: 'activation_attempt',
        status: 'rejected_hwid_mismatch',
        licenseKey: cleanKey,
        studentName: license.customerName,
        ip: `${effectiveIpv4} / ${effectiveIpv6}`,
        hwid,
        message: `Blocked: Unauthorized PC. Locked to: ${license.boundHwid}, Detected: ${hwid}`
      });
      return res.status(403).json({
        error: `Access Denied: This course is locked to another PC device (${license.boundHwid}). It cannot be opened on multiple computers.`
      });
    }

    // Success: Update license state
    license.lastAccessAt = new Date().toISOString();
    license.lastAccessIp = `${effectiveIpv4} / ${effectiveIpv6}`;
    if (!license.activatedAt) {
      license.activatedAt = new Date().toISOString();
    }
    db.saveLicense(license);

    db.addLog({
      action: 'activation_success',
      status: 'granted',
      licenseKey: cleanKey,
      studentName: license.customerName,
      ip: `${effectiveIpv4} / ${effectiveIpv6}`,
      hwid,
      message: `Granted course access to ${license.customerName}. Bound IPv4: ${license.boundIpv4}, IPv6: ${license.boundIpv6}, HWID: ${license.boundHwid}`
    });

    const sessionToken = crypto.randomBytes(24).toString('hex');
    activeSessions.set(sessionToken, {
      licenseKey: cleanKey,
      courseId: license.courseId,
      hwid,
      boundIpv4: license.boundIpv4,
      boundIpv6: license.boundIpv6,
      expiresAt: Date.now() + 12 * 60 * 60 * 1000 // 12 hours
    });

    res.json({
      success: true,
      sessionToken,
      decryptionKeyHex: course.encryptionKeyHex, // ephemeral key provided to RAM
      courseTitle: course.title,
      studentInfo: {
        name: license.customerName,
        email: license.customerEmail,
        boundIpv4: license.boundIpv4,
        boundIpv6: license.boundIpv6,
        hwid: license.boundHwid
      }
    });
  } catch (err) {
    console.error('Activation error:', err);
    res.status(500).json({ error: 'Activation failed: ' + err.message });
  }
});

// In-memory active DRM session store
const activeSessions = new Map();

// Helper to validate session token
function validateSession(token, req) {
  if (!token || !activeSessions.has(token)) return null;
  const sess = activeSessions.get(token);
  if (Date.now() > sess.expiresAt) {
    activeSessions.delete(token);
    return null;
  }
  return sess;
}

// -------------------------------------------------------------
// DRM STREAM PROXY (Hides & Masks Raw Wistia / Cloudfront URLs)
// -------------------------------------------------------------

// Proxy Playlist: Rewrites segments so real URLs are never exposed in Network tab
app.get('/api/drm/stream/playlist.m3u8', async (req, res) => {
  try {
    const { token, url: rawTargetUrl } = req.query;
    const session = validateSession(token, req);
    if (!session) {
      return res.status(403).send('#EXTM3U\n#ERROR: Access Denied. Invalid or expired DRM token.');
    }

    if (!rawTargetUrl) {
      return res.status(400).send('#EXTM3U\n#ERROR: Target URL missing.');
    }

    const targetUrl = Buffer.from(rawTargetUrl, 'base64').toString('utf8');
    const upstreamRes = await fetch(targetUrl);
    if (!upstreamRes.ok) {
      return res.status(upstreamRes.status).send('#EXTM3U\n#ERROR: Upstream stream unavailable.');
    }

    const playlistText = await upstreamRes.text();
    const urlObj = new URL(targetUrl);
    const baseUrl = `${urlObj.protocol}//${urlObj.host}`;

    // Rewrite segment URLs to go through our DRM stream proxy
    const lines = playlistText.split('\n');
    const rewrittenLines = lines.map(line => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) return line;

      let segmentUrl = trimmed;
      if (trimmed.startsWith('/')) {
        segmentUrl = `${baseUrl}${trimmed}`;
      } else if (!trimmed.startsWith('http://') && !trimmed.startsWith('https://')) {
        const basePath = targetUrl.substring(0, targetUrl.lastIndexOf('/') + 1);
        segmentUrl = `${basePath}${trimmed}`;
      }

      // Obfuscate segment URL with base64
      const b64Seg = Buffer.from(segmentUrl, 'utf8').toString('base64');
      return `/api/drm/stream/segment.ts?token=${token}&seg=${encodeURIComponent(b64Seg)}`;
    });

    res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.send(rewrittenLines.join('\n'));
  } catch (err) {
    console.error('Playlist proxy error:', err);
    res.status(500).send('#EXTM3U\n#ERROR: Internal DRM Proxy Error.');
  }
});

// Proxy Video Segment: Streams segment bytes without exposing origin
app.get('/api/drm/stream/segment.ts', async (req, res) => {
  try {
    const { token, seg } = req.query;
    const session = validateSession(token, req);
    if (!session) {
      return res.status(403).send('Forbidden: Invalid DRM Token');
    }

    if (!seg) return res.status(400).send('Missing segment identifier');

    const segmentUrl = Buffer.from(seg, 'base64').toString('utf8');
    const upstreamRes = await fetch(segmentUrl);

    if (!upstreamRes.ok) {
      return res.status(upstreamRes.status).send('Segment fetch error');
    }

    res.setHeader('Content-Type', 'video/MP2T');
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.setHeader('X-Content-Type-Options', 'nosniff');

    const arrayBuffer = await upstreamRes.arrayBuffer();
    res.send(Buffer.from(arrayBuffer));
  } catch (err) {
    console.error('Segment proxy error:', err);
    res.status(500).send('Segment proxy failure');
  }
});

// Client Tamper & Network Inspection Alert Endpoint
app.post('/api/client/tamper-alert', (req, res) => {
  const { licenseKey, hwid, reason } = req.body;
  const ips = getClientIps(req);

  db.addLog({
    action: 'inspection_detected',
    status: 'rejected_devtools_tampering',
    licenseKey: licenseKey || 'UNKNOWN',
    ip: `${ips.ipv4} / ${ips.ipv6}`,
    hwid: hwid || 'UNKNOWN',
    message: `SECURITY ALERT: ${reason || 'DevTools / Network tab inspection detected on student machine.'}`
  });

  res.json({ recorded: true });
});

// Periodic heartbeat from student app
app.post('/api/client/heartbeat', (req, res) => {
  const { licenseKey, hwid, clientIpv4, clientIpv6 } = req.body;
  const reqIps = getClientIps(req);
  const curIpv4 = clientIpv4 || reqIps.ipv4;
  const curIpv6 = clientIpv6 || reqIps.ipv6;

  const license = db.getLicenseByKey(licenseKey || '');
  if (!license || license.status === 'revoked') {
    return res.status(403).json({ valid: false, reason: 'License revoked or invalid.' });
  }

  // Check IP continuity
  if (license.boundIpv4 && license.boundIpv4 !== curIpv4 && license.boundIpv6 !== curIpv6) {
    return res.status(403).json({ valid: false, reason: `IP changed during session (${curIpv4} != ${license.boundIpv4}).` });
  }

  if (license.boundHwid && license.boundHwid !== hwid) {
    return res.status(403).json({ valid: false, reason: 'Hardware ID mismatch.' });
  }

  license.lastAccessAt = new Date().toISOString();
  db.saveLicense(license);

  res.json({ valid: true });
});

// Redirect root to admin
app.get('/', (req, res) => {
  res.redirect('/admin');
});

if (!process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`====================================================`);
    console.log(` SECURE COURSE DRM SERVER ACTIVE on Port ${PORT}`);
    console.log(` Admin Portal:        http://localhost:${PORT}/admin`);
    console.log(` Student Web Player:  http://localhost:${PORT}/student`);
    console.log(`====================================================`);
  });
}

export default app;
