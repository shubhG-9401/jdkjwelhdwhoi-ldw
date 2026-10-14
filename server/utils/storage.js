import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config/index.js';

/**
 * Ensures the encrypted file storage directory exists.
 */
export function ensureStorageDir() {
  if (!fs.existsSync(config.storageDir)) {
    try {
      fs.mkdirSync(config.storageDir, { recursive: true });
    } catch (e) {
      console.warn('Could not create storage directory:', e.message);
    }
  }
}

/**
 * Resolves the absolute path to a course's encrypted .enc file across Windows and Vercel/Linux environments.
 * 
 * @param {object} course
 * @returns {string | null}
 */
export function getCourseFilePath(course) {
  if (!course) return null;
  const fileName = course.encryptedFileName || `${course.id}.enc`;

  const candidates = [
    course.encryptedFilePath,
    path.join(config.storageDir, fileName),
    path.join(config.serverRoot, 'encrypted_storage', fileName),
    path.join(config.projectRoot, fileName),
    path.join(config.projectRoot, 'server', 'encrypted_storage', fileName)
  ];

  for (const candidate of candidates) {
    if (candidate && fs.existsSync(candidate)) {
      return candidate;
    }
  }

  // Return standard path inside configured storage directory
  return path.join(config.storageDir, fileName);
}

/**
 * Safely deletes a course's encrypted file if it exists.
 * 
 * @param {object} course
 */
export function deleteCourseFile(course) {
  const filePath = getCourseFilePath(course);
  if (filePath && fs.existsSync(filePath)) {
    try {
      fs.unlinkSync(filePath);
    } catch (e) {
      console.warn('Could not unlink course file:', e.message);
    }
  }
}
