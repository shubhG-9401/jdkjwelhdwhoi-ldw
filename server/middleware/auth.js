import { verifyAdminToken } from '../utils/token.js';

// In-memory sessions fallback map (for backward compatibility)
export const memorySessions = new Map();

/**
 * Express middleware to enforce valid Admin Bearer token authentication.
 * Uses stateless HMAC verification first, falling back to memory sessions.
 */
export function requireAdminAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      success: false,
      error: 'Unauthorized: Admin authentication token required.'
    });
  }

  const token = authHeader.substring(7).trim();
  const session = verifyAdminToken(token) || memorySessions.get(token);

  if (!session || Date.now() > session.expiresAt) {
    if (session) memorySessions.delete(token);
    return res.status(401).json({
      success: false,
      error: 'Unauthorized: Session expired or invalid. Please sign in again.'
    });
  }

  req.adminSession = session;
  next();
}
