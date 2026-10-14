import { adminApiClient } from '../api.js';
import { ADMIN_CONFIG } from '../config.js';
import { adminStore } from '../state.js';

export const logService = {
  async loadLogs(limit = 100) {
    const data = await adminApiClient.get(`${ADMIN_CONFIG.ENDPOINTS.LOGS}?limit=${limit}`);
    if (data.success && Array.isArray(data.logs)) {
      adminStore.setState({ securityLogs: data.logs });
    }
    return data.logs;
  }
};
