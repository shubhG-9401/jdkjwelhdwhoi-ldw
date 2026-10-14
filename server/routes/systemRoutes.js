import { Router } from 'express';
import { systemController } from '../controllers/systemController.js';
import { requireAdminAuth } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/errorHandler.js';

const router = Router();

// Storage status check
router.get('/status', asyncHandler(systemController.getStatus));

// Protected operations
router.get('/backup', requireAdminAuth, asyncHandler(systemController.getBackup));
router.post('/restore', requireAdminAuth, asyncHandler(systemController.restoreBackup));
router.post('/sync', requireAdminAuth, asyncHandler(systemController.forceSync));
router.delete('/licenses/:licenseKey', requireAdminAuth, asyncHandler(systemController.deleteLicense));
router.post('/licenses/:licenseKey/delete', requireAdminAuth, asyncHandler(systemController.deleteLicense));

export default router;
