import crypto from 'node:crypto';
import AdmZip from 'adm-zip';

export const MAGIC_HEADER = Buffer.from('SECUREDRM1', 'utf8'); // 10 bytes

/**
 * Generates a high-entropy random 256-bit encryption key (hex encoded).
 */
export function generateRandomKey() {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Encrypts a course bundle (manifest + files) into a secure binary format.
 * Format:
 * [10 bytes: MAGIC_HEADER]
 * [4 bytes: uint32BE keyIdLength]
 * [N bytes: keyId UTF-8]
 * [12 bytes: IV]
 * [16 bytes: GCM Auth Tag]
 * [Remaining bytes: Encrypted Ciphertext]
 *
 * @param {string} keyId - Identifier for the course / encryption key
 * @param {string} keyHex - 256-bit encryption key (64 hex characters)
 * @param {object} manifest - Course structure & lesson details
 * @param {Array<{filename: string, buffer: Buffer}>} files - Course asset files
 * @returns {Buffer} - Encrypted binary buffer
 */
export function encryptCourseBundle(keyId, keyHex, manifest, files) {
  // 1. Create in-memory zip archive
  const zip = new AdmZip();
  zip.addFile('manifest.json', Buffer.from(JSON.stringify(manifest, null, 2), 'utf8'));

  for (const file of files) {
    zip.addFile(`assets/${file.filename}`, file.buffer);
  }

  const unencryptedBuffer = zip.toBuffer();

  // 2. Setup AES-256-GCM cipher
  const key = Buffer.from(keyHex, 'hex');
  const iv = crypto.randomBytes(12); // standard 96-bit IV for GCM
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);

  const ciphertext = Buffer.concat([
    cipher.update(unencryptedBuffer),
    cipher.final()
  ]);

  const authTag = cipher.getAuthTag(); // 16 bytes

  // 3. Assemble binary container
  const keyIdBuffer = Buffer.from(keyId, 'utf8');
  const keyIdLenBuffer = Buffer.alloc(4);
  keyIdLenBuffer.writeUInt32BE(keyIdBuffer.length, 0);

  return Buffer.concat([
    MAGIC_HEADER,
    keyIdLenBuffer,
    keyIdBuffer,
    iv,
    authTag,
    ciphertext
  ]);
}

/**
 * Inspects an encrypted file to read its header and verify format without decrypting.
 * @param {Buffer} encryptedBuffer
 */
export function inspectEncryptedFile(encryptedBuffer) {
  if (encryptedBuffer.length < MAGIC_HEADER.length + 4 + 12 + 16) {
    throw new Error('Invalid file format: File too small or corrupted.');
  }

  const header = encryptedBuffer.subarray(0, MAGIC_HEADER.length);
  if (!header.equals(MAGIC_HEADER)) {
    throw new Error('Not a valid SecureDRM encrypted course file.');
  }

  let offset = MAGIC_HEADER.length;
  const keyIdLen = encryptedBuffer.readUInt32BE(offset);
  offset += 4;

  const keyId = encryptedBuffer.subarray(offset, offset + keyIdLen).toString('utf8');
  offset += keyIdLen;

  const iv = encryptedBuffer.subarray(offset, offset + 12);
  offset += 12;

  const authTag = encryptedBuffer.subarray(offset, offset + 16);
  offset += 16;

  const ciphertextLength = encryptedBuffer.length - offset;

  return {
    keyId,
    ivHex: iv.toString('hex'),
    authTagHex: authTag.toString('hex'),
    ciphertextSize: ciphertextLength,
    totalSize: encryptedBuffer.length,
    headerOffset: offset
  };
}

/**
 * Decrypts the binary container in-memory.
 * Returns the manifest and file buffers in-memory. Nothing is written to disk.
 *
 * @param {Buffer} encryptedBuffer
 * @param {string} keyHex - 256-bit encryption key (64 hex characters)
 * @returns {{ manifest: object, files: Map<string, Buffer> }}
 */
export function decryptCourseBundle(encryptedBuffer, keyHex) {
  const meta = inspectEncryptedFile(encryptedBuffer);
  const key = Buffer.from(keyHex, 'hex');

  const offset = meta.headerOffset;
  const iv = Buffer.from(meta.ivHex, 'hex');
  const authTag = Buffer.from(meta.authTagHex, 'hex');
  const ciphertext = encryptedBuffer.subarray(offset);

  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);

  const decryptedBuffer = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final()
  ]);

  // Read decrypted zip in memory
  const zip = new AdmZip(decryptedBuffer);
  const manifestEntry = zip.getEntry('manifest.json');
  if (!manifestEntry) {
    throw new Error('Invalid course bundle: manifest.json missing.');
  }

  const manifest = JSON.parse(zip.readAsText(manifestEntry));
  const files = new Map();

  for (const entry of zip.getEntries()) {
    if (entry.entryName.startsWith('assets/') && !entry.isDirectory) {
      const filename = entry.entryName.replace('assets/', '');
      files.set(filename, entry.getData());
    }
  }

  return { manifest, files };
}
