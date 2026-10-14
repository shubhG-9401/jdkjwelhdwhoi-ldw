import { Router } from 'express';
import { licenseController } from '../controllers/licenseController.js';
import { requireAdminAuth } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/errorHandler.js';

const router = Router();

router.use(requireAdminAuth);

router.get('/', asyncHandler(licenseController.listLicenses));
router.post('/', asyncHandler(licenseController.createLicense));
router.post('/issue', asyncHandler(licenseController.createLicense));
router.post('/:licenseKey/revoke', asyncHandler(licenseController.revokeLicense));
router.post('/:licenseKey/reset-device', asyncHandler(licenseController.resetDevice));

export default router;
