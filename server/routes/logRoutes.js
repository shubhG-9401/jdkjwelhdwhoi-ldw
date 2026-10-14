import { Router } from 'express';
import { logController } from '../controllers/logController.js';
import { requireAdminAuth } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/errorHandler.js';

const router = Router();

router.use(requireAdminAuth);
router.get('/', asyncHandler(logController.getLogs));

export default router;
