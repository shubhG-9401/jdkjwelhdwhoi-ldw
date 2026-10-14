/**
 * Student App Cryptographic Engine
 * AES-256-GCM in-memory decryption and package extraction via WebCrypto & JSZip.
 */

/**
 * Parses binary header from a SecureDRM1 encrypted package.
 * 
 * @param {Uint8Array} uint8Array
 * @returns {{ keyId: string, iv: Uint8Array, authTag: Uint8Array, ciphertext: Uint8Array, totalLength: number }}
 */
export function parseEncryptedHeader(uint8Array) {
  const magic = new TextDecoder().decode(uint8Array.subarray(0, 10));
  if (magic !== 'SECUREDRM1') {
    throw new Error('Invalid file format. This is not a SecureDRM encrypted course file.');
  }

  const view = new DataView(uint8Array.buffer, uint8Array.byteOffset, uint8Array.byteLength);
  let offset = 10;
  const keyIdLen = view.getUint32(offset, false);
  offset += 4;

  const keyId = new TextDecoder().decode(uint8Array.subarray(offset, offset + keyIdLen));
  offset += keyIdLen;

  const iv = uint8Array.subarray(offset, offset + 12);
  offset += 12;

  const authTag = uint8Array.subarray(offset, offset + 16);
  offset += 16;

  const ciphertext = uint8Array.subarray(offset);

  return {
    keyId,
    iv,
    authTag,
    ciphertext,
    totalLength: uint8Array.length
  };
}

/**
 * Decrypts AES-256-GCM package using WebCrypto API.
 * 
 * @param {object} meta
 * @param {string} keyHex
 * @returns {Promise<{ manifest: object, files: Map<string, Blob> }>}
 */
export async function decryptWithWebCrypto(meta, keyHex) {
  const rawKey = new Uint8Array(keyHex.match(/.{1,2}/g).map(byte => parseInt(byte, 16)));
  const cryptoKey = await window.crypto.subtle.importKey(
    'raw',
    rawKey,
    { name: 'AES-GCM' },
    false,
    ['decrypt']
  );

  const combinedCiphertext = new Uint8Array(meta.ciphertext.length + meta.authTag.length);
  combinedCiphertext.set(meta.ciphertext, 0);
  combinedCiphertext.set(meta.authTag, meta.ciphertext.length);

  const decryptedArrayBuffer = await window.crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: meta.iv },
    cryptoKey,
    combinedCiphertext
  );

  const zip = await JSZip.loadAsync(decryptedArrayBuffer);
  const manifestFile = zip.file('manifest.json');
  if (!manifestFile) throw new Error('manifest.json missing inside course bundle.');

  const manifestText = await manifestFile.async('text');
  const manifest = JSON.parse(manifestText);

  const files = new Map();
  const assetFiles = zip.folder('assets');
  if (assetFiles) {
    const promises = [];
    assetFiles.forEach((relativePath, file) => {
      if (!file.dir) {
        promises.push((async () => {
          const blob = await file.async('blob');
          files.set(relativePath, blob);
        })());
      }
    });
    await Promise.all(promises);
  }

  return { manifest, files };
}

/**
 * Decrypts a full course package, utilizing desktopBridge when running in Electron,
 * or WebCrypto in the browser.
 */
export async function decryptCoursePackage(encryptedFileBuffer, keyHex) {
  if (window.desktopBridge && window.desktopBridge.decryptBundle) {
    const decryptRes = await window.desktopBridge.decryptBundle({
      bufferArray: Array.from(encryptedFileBuffer),
      keyHex
    });

    if (!decryptRes.success) throw new Error('Decryption failed: ' + decryptRes.error);

    const filesMap = new Map();
    for (const [fname, fbuf] of Object.entries(decryptRes.files || {})) {
      const blob = new Blob([new Uint8Array(fbuf.data || fbuf)]);
      filesMap.set(fname, blob);
    }

    return { manifest: decryptRes.manifest, files: filesMap };
  }

  const parsedMeta = parseEncryptedHeader(encryptedFileBuffer);
  return await decryptWithWebCrypto(parsedMeta, keyHex);
}
