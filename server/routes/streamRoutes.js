import { Router } from 'express';
import { streamController } from '../controllers/streamController.js';
import { asyncHandler } from '../middleware/errorHandler.js';

const router = Router();

router.get('/playlist.m3u8', asyncHandler(streamController.getPlaylist));
router.get('/segment.ts', asyncHandler(streamController.getSegment));

export default router;
