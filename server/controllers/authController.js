import crypto from 'node:crypto';
import { db } from '../db.js';
import { createAdminToken, verifyAdminToken } from '../utils/token.js';
import { memorySessions } from '../middleware/auth.js';
import {
  generateSecret,
  generateOtpAuthUri,
  generateQrCodeDataUrl,
  verifyTotp
} from '../totp.js';

export const authController = {
  // Check Admin session status
  checkStatus(req, res) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.json({ authenticated: false });
    }
    const token = authHeader.substring(7).trim();
    const session = verifyAdminToken(token) || memorySessions.get(token);
    if (!session || Date.now() > session.expiresAt) {
      if (session) memorySessions.delete(token);
      return res.json({ authenticated: false });
    }
    const auth = db.getAdminAuth();
    res.json({ authenticated: true, loginId: auth.loginId });
  },

  // Get current TOTP setup info (QR code & secret key)
  async getSetupInfo(req, res) {
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
  },

  // Admin Login with 2FA Authenticator
  login(req, res) {
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

    // Verify 6-digit TOTP token
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
    memorySessions.set(token, {
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
  },

  // Admin Logout
  logout(req, res) {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7).trim();
      memorySessions.delete(token);
    }
    res.json({ success: true, message: 'Logged out successfully.' });
  },

  // Generate fresh candidate TOTP secret & QR code
  async generateNewSecret(req, res) {
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
  },

  // Update Admin Credentials (Change Login ID, Password, and/or TOTP Secret)
  async updateCredentials(req, res) {
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

    if (Object.keys(updates).length === 0) {
      return res.json({ success: true, message: 'No credential changes specified.', auth: { loginId: auth.loginId } });
    }

    const saved = db.saveAdminAuth(updates);

    db.addLog({
      action: 'admin_security_updated',
      status: 'granted',
      message: `Admin security updated: Login ID "${saved.loginId}", Password ${updates.passwordHash ? 'changed' : 'unchanged'}, TOTP ${updates.totpSecret ? 're-paired' : 'unchanged'}.`
    });

    res.json({
      success: true,
      message: 'Admin security credentials updated successfully.',
      auth: { loginId: saved.loginId, totpEnabled: saved.totpEnabled }
    });
  }
};
