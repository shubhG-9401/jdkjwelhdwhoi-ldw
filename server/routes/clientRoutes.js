import { Router } from 'express';
import multer from 'multer';
import { clientController } from '../controllers/clientController.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { config } from '../config/index.js';

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.maxFileSize }
});

router.get('/my-ip', asyncHandler(clientController.getMyIp));
router.post('/inspect-file', upload.single('encFile'), asyncHandler(clientController.inspectFile));
router.post('/activate', asyncHandler(clientController.activate));
router.post('/heartbeat', asyncHandler(clientController.heartbeat));
router.post('/tamper-alert', asyncHandler(clientController.tamperAlert));
router.post('/report-client-ipv6', asyncHandler(clientController.reportClientIpv6));

export default router;
