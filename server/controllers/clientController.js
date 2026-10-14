import crypto from 'node:crypto';
import { db } from '../db.js';
import { config } from '../config/index.js';
import { inspectEncryptedFile } from '../cryptoEngine.js';
import { getClientIps, isMobileDevice } from '../utils/network.js';

// In-memory active DRM session store (with memory fallback)
export const activeSessions = new Map();

/**
 * Creates an HMAC signed session token for DRM streaming.
 */
export function createClientSessionToken(data) {
  const payload = {
    ...data,
    createdAt: Date.now(),
    expiresAt: Date.now() + 12 * 60 * 60 * 1000 // 12 hours
  };
  const b64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', config.jwtSecret).update(b64).digest('base64url');
  return `${b64}.${sig}`;
}

/**
 * Verifies a DRM stream session token.
 */
export function validateClientSession(token, req) {
  if (!token || typeof token !== 'string') return null;

  // Check stateless HMAC token
  const parts = token.split('.');
  if (parts.length === 2) {
    const [b64, sig] = parts;
    const expectedSig = crypto.createHmac('sha256', config.jwtSecret).update(b64).digest('base64url');
    if (sig === expectedSig) {
      try {
        const payload = JSON.parse(Buffer.from(b64, 'base64url').toString('utf8'));
        if (Date.now() <= payload.expiresAt) return payload;
      } catch {}
    }
  }

  // Memory fallback
  if (activeSessions.has(token)) {
    const sess = activeSessions.get(token);
    if (Date.now() <= sess.expiresAt) return sess;
    activeSessions.delete(token);
  }

  return null;
}

export const clientController = {
  // Inspect encrypted file header (.enc)
  inspectFile(req, res) {
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
  },

  // Verify License and Activate Session (Dual IPv4 & IPv6 + HWID enforcement + Mobile Rejection)
  activate(req, res) {
    const { licenseKey, hwid, keyId, clientIpv4, clientIpv6 } = req.body;
    const reqIps = getClientIps(req);
    const effectiveIpv4 = clientIpv4 || reqIps.ipv4;
    const effectiveIpv6 = clientIpv6 || reqIps.ipv6;

    if (!licenseKey || !hwid) {
      return res.status(400).json({ error: 'License key and Device Hardware ID (HWID) are required.' });
    }

    // Enforce 56-character license key length check
    const cleanKey = licenseKey.trim().toUpperCase();
    if (cleanKey.length !== config.licenseKeyLength) {
      return res.status(400).json({
        error: `Invalid License Key length (${cleanKey.length} chars). License keys must be exactly 56 characters long.`
      });
    }

    // Reject mobile devices
    if (isMobileDevice(req)) {
      db.addLog({
        action: 'activation_attempt',
        status: 'rejected_mobile_device',
        licenseKey: cleanKey,
        ip: `${effectiveIpv4} / ${effectiveIpv6}`,
        hwid,
        message: `Blocked activation attempt from mobile device (${(req.headers['user-agent'] || '').substring(0, 80)}). Course playback is restricted to Windows PC.`
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

    // --- 1. IP Validation (Dual-Stack IPv4 / IPv6) ---
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
      license.boundHwid = hwid;
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

    const sessionPayload = {
      licenseKey: cleanKey,
      courseId: license.courseId,
      hwid,
      boundIpv4: license.boundIpv4,
      boundIpv6: license.boundIpv6
    };
    const sessionToken = createClientSessionToken(sessionPayload);
    activeSessions.set(sessionToken, {
      ...sessionPayload,
      expiresAt: Date.now() + 12 * 60 * 60 * 1000
    });

    res.json({
      success: true,
      sessionToken,
      streamToken: sessionToken,
      decryptionKeyHex: course.encryptionKeyHex,
      courseTitle: course.title,
      studentInfo: {
        name: license.customerName,
        email: license.customerEmail,
        boundIpv4: license.boundIpv4,
        boundIpv6: license.boundIpv6,
        hwid: license.boundHwid
      }
    });
  },

  // Periodic heartbeat from student app
  heartbeat(req, res) {
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
  },

  // Client Tamper & Network Inspection Alert Endpoint
  tamperAlert(req, res) {
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
  }
};
