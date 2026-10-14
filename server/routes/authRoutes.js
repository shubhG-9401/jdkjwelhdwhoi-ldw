import { Router } from 'express';
import { authController } from '../controllers/authController.js';
import { requireAdminAuth } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/errorHandler.js';

const router = Router();

router.get('/status', asyncHandler(authController.checkStatus));
router.get('/setup-info', requireAdminAuth, asyncHandler(authController.getSetupInfo));
router.post('/login', asyncHandler(authController.login));
router.post('/logout', asyncHandler(authController.logout));
router.get('/generate-new-secret', requireAdminAuth, asyncHandler(authController.generateNewSecret));
router.post('/update-credentials', requireAdminAuth, asyncHandler(authController.updateCredentials));

export default router;
