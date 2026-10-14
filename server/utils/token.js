import crypto from 'node:crypto';
import { config } from '../config/index.js';

/**
 * Creates a stateless, cryptographically signed HMAC-SHA256 admin session token.
 * Valid across server restarts and serverless lambdas.
 * 
 * @param {string} loginId
 * @returns {string}
 */
export function createAdminToken(loginId) {
  const payload = {
    loginId,
    createdAt: Date.now(),
    expiresAt: Date.now() + config.sessionTtlMs
  };
  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', config.jwtSecret).update(payloadB64).digest('base64url');
  return `${payloadB64}.${sig}`;
}

/**
 * Verifies and decodes an HMAC-SHA256 admin session token.
 * 
 * @param {string} token
 * @returns {{ loginId: string, createdAt: number, expiresAt: number } | null}
 */
export function verifyAdminToken(token) {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;

  const [payloadB64, sig] = parts;
  const expectedSig = crypto.createHmac('sha256', config.jwtSecret).update(payloadB64).digest('base64url');
  if (sig !== expectedSig) return null;

  try {
    const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
    if (Date.now() > payload.expiresAt) return null;
    return payload;
  } catch {
    return null;
  }
}

/**
 * Generates a high-entropy 56-character license key.
 * Format: exactly 56 characters (alphanumeric uppercase without easily confused symbols)
 * 
 * @returns {string}
 */
export function generate56CharLicenseKey() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = crypto.randomBytes(config.licenseKeyLength);
  let key = '';
  for (let i = 0; i < config.licenseKeyLength; i++) {
    key += chars[bytes[i] % chars.length];
  }
  return key;
}
