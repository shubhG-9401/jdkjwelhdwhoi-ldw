import { adminApiClient } from '../api.js';
import { ADMIN_CONFIG } from '../config.js';

export const systemService = {
  async getStatus() {
    return await adminApiClient.get(`${ADMIN_CONFIG.ENDPOINTS.SYSTEM}/status`);
  },

  async forceSync() {
    return await adminApiClient.post(`${ADMIN_CONFIG.ENDPOINTS.SYSTEM}/sync`, {});
  },

  async restoreBackup(backupData) {
    return await adminApiClient.post(`${ADMIN_CONFIG.ENDPOINTS.SYSTEM}/restore`, backupData);
  },

  downloadBackup() {
    const token = localStorage.getItem(ADMIN_CONFIG.TOKEN_KEY);
    const url = `${ADMIN_CONFIG.ENDPOINTS.SYSTEM}/backup?token=${encodeURIComponent(token || '')}`;
    // Fetch with Authorization header and trigger blob download
    fetch(`${ADMIN_CONFIG.ENDPOINTS.SYSTEM}/backup`, {
      headers: {
        Authorization: `Bearer ${token}`
      }
    })
      .then(res => {
        if (!res.ok) throw new Error('Backup failed: ' + res.statusText);
        return res.blob();
      })
      .then(blob => {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `drm_backup_${new Date().toISOString().slice(0, 10)}.json`;
        document.body.appendChild(a);
        a.click();
        a.remove();
      })
      .catch(err => {
        alert('Failed to download database backup: ' + err.message);
      });
  }
};
