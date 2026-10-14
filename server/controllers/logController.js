import { db } from '../db.js';

export const logController = {
  // Get system and security audit logs
  getLogs(req, res) {
    const limit = parseInt(req.query.limit || '100', 10);
    const logs = db.getLogs(limit);
    res.json({ success: true, logs });
  }
};
