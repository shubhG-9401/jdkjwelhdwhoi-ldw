import { Router } from 'express';
import authRoutes from './authRoutes.js';
import courseRoutes from './courseRoutes.js';
import licenseRoutes from './licenseRoutes.js';
import clientRoutes from './clientRoutes.js';
import streamRoutes from './streamRoutes.js';
import logRoutes from './logRoutes.js';

const apiRouter = Router();

// Health Check
apiRouter.get('/health', (req, res) => {
  res.json({
    status: 'online',
    timestamp: new Date().toISOString(),
    version: '2.0.0-modular'
  });
});

// Admin Sub-Routes
apiRouter.use('/admin/auth', authRoutes);
apiRouter.use('/admin/courses', courseRoutes);
apiRouter.use('/admin/licenses', licenseRoutes);
apiRouter.use('/admin/logs', logRoutes);

// Root Aliases for maximum compatibility
apiRouter.use('/auth', authRoutes);
apiRouter.use('/courses', courseRoutes);
apiRouter.use('/licenses', licenseRoutes);
apiRouter.use('/logs', logRoutes);

// Client Sub-Routes
apiRouter.use('/client', clientRoutes);

// Stream Proxy Sub-Routes
apiRouter.use('/drm/stream', streamRoutes);

export default apiRouter;
