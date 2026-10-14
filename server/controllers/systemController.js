import { db } from '../db.js';

export const systemController = {
  /**
   * Returns current database persistence status, active provider, counts, and guidance.
   */
  async getStatus(req, res) {
    try {
      const status = db.getSystemStatus();
      res.json({
        success: true,
        ...status
      });
    } catch (err) {
      res.status(500).json({ error: 'Failed to retrieve system status: ' + err.message });
    }
  },

  /**
   * Downloads the complete database store as a backup JSON file.
   */
  async getBackup(req, res) {
    try {
      const data = db.exportData();
      const filename = `drm_backup_${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.setHeader('Content-Type', 'application/json');
      res.send(JSON.stringify(data, null, 2));
    } catch (err) {
      res.status(500).json({ error: 'Backup export failed: ' + err.message });
    }
  },

  /**
   * Restores the database from an imported JSON payload.
   */
  async restoreBackup(req, res) {
    try {
      const payload = req.body;
      if (!payload || (!payload.courses && !payload.licenses)) {
        return res.status(400).json({ error: 'Invalid backup JSON. Must contain courses or licenses.' });
      }
      const restored = db.restoreData(payload);
      db.addLog({
        action: 'system_restore',
        status: 'granted',
        ip: req.clientIp || '127.0.0.1',
        message: `Database restored with ${restored.courses.length} courses and ${restored.licenses.length} licenses.`
      });
      res.json({
        success: true,
        message: `Database successfully restored. Loaded ${restored.courses.length} courses and ${restored.licenses.length} licenses.`,
        stats: db.getSystemStatus()
      });
    } catch (err) {
      res.status(500).json({ error: 'Database restore failed: ' + err.message });
    }
  },

  /**
   * Forces an immediate synchronization between memory, local disk, and remote storage.
   */
  async forceSync(req, res) {
    try {
      await db.init();
      const status = db.getSystemStatus();
      res.json({
        success: true,
        message: 'Database synchronization complete.',
        status
      });
    } catch (err) {
      res.status(500).json({ error: 'Sync failed: ' + err.message });
    }
  },

  /**
   * Deletes a license permanently by key.
   */
  async deleteLicense(req, res) {
    try {
      const { licenseKey } = req.params;
      const removed = db.deleteLicense(licenseKey);
      if (!removed) {
        return res.status(404).json({ error: 'License key not found to delete.' });
      }
      db.addLog({
        action: 'license_deleted',
        status: 'granted',
        ip: req.clientIp || '127.0.0.1',
        message: `Permanently deleted license key ${licenseKey} (${removed.customerName}).`
      });
      res.json({
        success: true,
        message: `License key ${licenseKey} permanently deleted.`,
        license: removed
      });
    } catch (err) {
      res.status(500).json({ error: 'Failed to delete license: ' + err.message });
    }
  }
};
