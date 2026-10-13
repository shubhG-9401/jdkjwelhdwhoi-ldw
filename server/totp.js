import crypto from 'node:crypto';
import QRCode from 'qrcode';

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function base32Encode(buffer) {
  let bits = '';
  for (let i = 0; i < buffer.length; i++) {
    bits += buffer[i].toString(2).padStart(8, '0');
  }
  let base32 = '';
  for (let i = 0; i < bits.length; i += 5) {
    const chunk = bits.substring(i, i + 5);
    base32 += BASE32_ALPHABET[parseInt(chunk.padEnd(5, '0'), 2)];
  }
  return base32;
}

export function base32Decode(base32Str) {
  const clean = base32Str.toUpperCase().replace(/=+$/, '').replace(/\s+/g, '');
  let bits = '';
  for (let i = 0; i < clean.length; i++) {
    const val = BASE32_ALPHABET.indexOf(clean[i]);
    if (val === -1) continue;
    bits += val.toString(2).padStart(5, '0');
  }
  const bytes = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    bytes.push(parseInt(bits.substring(i, i + 8), 2));
  }
  return Buffer.from(bytes);
}

/**
 * Generates a standard 160-bit (20 bytes) Base32 secret for TOTP.
 */
export function generateSecret() {
  const randomBytes = crypto.randomBytes(20);
  return base32Encode(randomBytes);
}

/**
 * Builds the standard otpauth URI.
 */
export function generateOtpAuthUri(loginId, secret, issuer = 'SecureDRM') {
  const encodedIssuer = encodeURIComponent(issuer);
  const encodedLabel = `${encodedIssuer}:${encodeURIComponent(loginId)}`;
  return `otpauth://totp/${encodedLabel}?secret=${secret}&issuer=${encodedIssuer}&algorithm=SHA1&digits=6&period=30`;
}

/**
 * Generates a QR code Data URL (PNG) from an otpauth URI.
 */
export async function generateQrCodeDataUrl(otpAuthUri) {
  return await QRCode.toDataURL(otpAuthUri, {
    width: 250,
    margin: 2,
    color: {
      dark: '#000000',
      light: '#ffffff'
    }
  });
}

/**
 * Generates the 6-digit TOTP for a given step offset.
 */
export function generateTotp(secret, stepOffset = 0) {
  const key = base32Decode(secret);
  const epoch = Math.floor(Date.now() / 1000);
  const timeStep = Math.floor(epoch / 30) + stepOffset;

  const counterBuf = Buffer.alloc(8);
  counterBuf.writeBigUInt64BE(BigInt(timeStep));

  const hmac = crypto.createHmac('sha1', key);
  hmac.update(counterBuf);
  const digest = hmac.digest();

  const offset = digest[digest.length - 1] & 0x0f;
  const binary =
    ((digest[offset] & 0x7f) << 24) |
    ((digest[offset + 1] & 0xff) << 16) |
    ((digest[offset + 2] & 0xff) << 8) |
    (digest[offset + 3] & 0xff);

  return (binary % 1000000).toString().padStart(6, '0');
}

/**
 * Verifies a 6-digit token against a secret with window tolerance.
 */
export function verifyTotp(token, secret, window = 1) {
  if (!token || typeof token !== 'string') return false;
  const clean = token.trim();
  if (clean.length !== 6 || !/^\d{6}$/.test(clean)) return false;

  for (let i = -window; i <= window; i++) {
    if (generateTotp(secret, i) === clean) {
      return true;
    }
  }
  return false;
}
