import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { db } from '../db.js';
import { config } from '../config/index.js';
import { getCourseFilePath, deleteCourseFile, ensureStorageDir } from '../utils/storage.js';
import {
  generateRandomKey,
  encryptCourseBundle
} from '../cryptoEngine.js';
import { parseCourseDocumentText, extractTextFromBuffer } from '../docParser.js';

export const courseController = {
  // Preview parsed course from text or uploaded doc
  async previewDoc(req, res) {
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
  },

  // List all courses
  listCourses(req, res) {
    const courses = db.getCourses();
    res.json({ success: true, courses });
  },

  // Download an encrypted .enc file
  downloadCourse(req, res) {
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
  },

  // Create & Encrypt Course Package (from Doc file, Text paste, or media assets)
  async encryptCourse(req, res) {
    ensureStorageDir();
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
      const parsed = parseCourseDocumentText(courseDocText);
      detectedCourseName = parsed.courseName;
      syllabus = parsed.modules;
    } else if (syllabusJson) {
      try {
        syllabus = JSON.parse(syllabusJson);
      } catch {
        syllabus = [];
      }
    }

    if (!title || title.trim() === '') {
      title = detectedCourseName || 'Untitled Encrypted Course';
    }

    const packagedFiles = [];

    // If no document syllabus was supplied, assemble from uploaded files
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
      // Attach media files alongside syllabus links
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

    // Encrypt syllabus + files into .enc format
    const encryptedBuffer = encryptCourseBundle(courseId, encryptionKeyHex, manifest, packagedFiles);

    const safeTitle = title.toLowerCase().replace(/[^a-z0-9]+/g, '_');
    const encryptedFileName = `${safeTitle}_${courseId}.enc`;
    const encryptedFilePath = path.join(config.storageDir, encryptedFileName);

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
      encryptionKeyHex,
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
  },

  // Update an existing course (Add/Remove lessons or modules, preserving active master key)
  updateCourse(req, res) {
    const { courseId } = req.params;
    const { title, description, modules } = req.body;

    const course = db.getCourseById(courseId);
    if (!course) {
      return res.status(404).json({ error: 'Course not found.' });
    }

    if (!Array.isArray(modules)) {
      return res.status(400).json({ error: 'Modules array is required.' });
    }

    const encryptionKeyHex = course.encryptionKeyHex;

    const updatedManifest = {
      courseId,
      title: title || course.title,
      description: description !== undefined ? description : course.description,
      createdAt: course.manifest?.createdAt || course.createdAt,
      updatedAt: new Date().toISOString(),
      modules
    };

    // Re-encrypt container preserving the master key so student licenses remain valid
    const encryptedBuffer = encryptCourseBundle(courseId, encryptionKeyHex, updatedManifest, []);

    // Write back to encrypted file path
    const targetFilePath = getCourseFilePath(course);
    try {
      fs.writeFileSync(targetFilePath, encryptedBuffer);
    } catch (writeErr) {
      console.warn('Could not write updated package to target path, trying config.storageDir:', writeErr.message);
      try {
        fs.writeFileSync(path.join(config.storageDir, course.encryptedFileName), encryptedBuffer);
      } catch (e2) {}
    }

    // Update root copy if applicable
    const rootCopy = path.join(config.projectRoot, course.encryptedFileName);
    if (fs.existsSync(rootCopy) || course.id === 'crs_c12') {
      try { fs.writeFileSync(rootCopy, encryptedBuffer); } catch (e) {}
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
  },

  // Delete an existing course
  deleteCourse(req, res) {
    const { courseId } = req.params;
    const removed = db.deleteCourse(courseId);
    if (!removed) {
      return res.status(404).json({ error: 'Course not found.' });
    }

    deleteCourseFile(removed);

    db.addLog({
      action: 'course_deleted',
      status: 'granted',
      courseId,
      message: `Course "${removed.title}" (${courseId}) was deleted by administrator.`
    });

    res.json({ success: true, message: `Course "${removed.title}" deleted successfully.` });
  }
};
