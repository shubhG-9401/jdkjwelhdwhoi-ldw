import { Router } from 'express';
import multer from 'multer';
import { courseController } from '../controllers/courseController.js';
import { requireAdminAuth } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { config } from '../config/index.js';

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.maxFileSize }
});

router.get('/', asyncHandler(courseController.listCourses));
router.get('/:courseId/download', asyncHandler(courseController.downloadCourse));
router.post('/preview-doc', requireAdminAuth, upload.single('docFile'), asyncHandler(courseController.previewDoc));
router.post('/encrypt', requireAdminAuth, upload.any(), asyncHandler(courseController.encryptCourse));
router.put('/:courseId', requireAdminAuth, asyncHandler(courseController.updateCourse));
router.delete('/:courseId', requireAdminAuth, asyncHandler(courseController.deleteCourse));

export default router;
