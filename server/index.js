import app from './app.js';
import { config } from './config/index.js';
import { getCourseFilePath } from './utils/storage.js';

// Export app and storage helpers for external scripts & Vercel
export { app, getCourseFilePath };
export default app;

// Global process-level crash guards to ensure the server never crashes
process.on('uncaughtException', (err) => {
  console.error('[FATAL CRASH GUARD] Uncaught Exception caught safely:', err.stack || err.message);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('[FATAL CRASH GUARD] Unhandled Promise Rejection caught safely at:', promise, 'reason:', reason);
});

// Run HTTP listener only when not inside a serverless environment (e.g. Vercel)
if (!config.isVercel) {
  const server = app.listen(config.port, () => {
    console.log(`====================================================`);
    console.log(` SECURE COURSE DRM SERVER ACTIVE on Port ${config.port}`);
    console.log(` Environment:         ${config.env}`);
    console.log(` Admin Portal:        http://localhost:${config.port}/admin`);
    console.log(` Student Web Player:  http://localhost:${config.port}/student`);
    console.log(` Health Check:        http://localhost:${config.port}/api/health`);
    console.log(`====================================================`);
  });

  server.on('error', (err) => {
    console.error('[SERVER ERROR]', err.message);
  });
}
