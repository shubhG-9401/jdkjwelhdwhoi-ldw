import express from 'express';
import cors from 'cors';
import { config } from './config/index.js';
import { db } from './db.js';
import apiRouter from './routes/index.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { mobileBlocker } from './middleware/mobileBlocker.js';
import { ensureStorageDir } from './utils/storage.js';

// Initialize storage directory
ensureStorageDir();

// Pre-initialize database store asynchronously
db.init().catch(err => console.warn('[DB INIT WARN]', err.message));

const app = express();

// Security and utility middleware
app.use(cors());
app.use(express.json({ limit: '60mb' }));
app.use(express.urlencoded({ extended: true, limit: '60mb' }));

// Middleware to ensure database is hydrated on serverless cold starts
app.use(async (req, res, next) => {
  try {
    await db.init();
  } catch (e) {
    // Non-blocking: will fallback to local/cached data
  }
  next();
});

// Static frontend routes
app.use('/admin', express.static(config.adminPortalDir));
app.use('/student', mobileBlocker, express.static(config.studentAppDir));
app.use('/node_modules', express.static(config.nodeModulesDir));

// Mount modular API routes
app.use('/api', apiRouter);

// Root redirect to Admin Portal
app.get('/', (req, res) => {
  res.redirect('/admin');
});

// 404 Not Found handler for unmatched API routes
app.use('/api/*', notFoundHandler);

// Centralized error handling middleware
app.use(errorHandler);

export default app;
