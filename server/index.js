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

  // Render Free Tier Keep-Alive: Ping itself every 10 minutes to prevent idle spin-down
  const keepAliveUrl = process.env.RENDER_EXTERNAL_URL || process.env.APP_URL;
  if (keepAliveUrl) {
    const pingUrl = keepAliveUrl.replace(/\/$/, '') + '/api/health';
    console.log(`[KEEP-ALIVE] Auto-ping active for Render free tier: ${pingUrl}`);
    setInterval(() => {
      fetch(pingUrl)
        .then(r => console.log(`[KEEP-ALIVE] Heartbeat ping sent (Status: ${r.status})`))
        .catch(e => console.warn(`[KEEP-ALIVE] Heartbeat ping warning: ${e.message}`));
    }, 10 * 60 * 1000); // Ping every 10 minutes (Render idle timeout is 15 min)
  }
}

