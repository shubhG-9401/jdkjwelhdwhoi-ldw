import { adminApiClient } from '../api.js';
import { ADMIN_CONFIG } from '../config.js';
import { adminStore } from '../state.js';

export const authService = {
  async checkStatus() {
    try {
      const data = await adminApiClient.get(ADMIN_CONFIG.ENDPOINTS.AUTH_STATUS);
      if (data.authenticated) {
        adminStore.setState({
          isAuthenticated: true,
          currentLoginId: data.loginId || 'admin'
        });
        return true;
      }
      adminStore.setState({ isAuthenticated: false });
      return false;
    } catch {
      adminStore.setState({ isAuthenticated: false });
      return false;
    }
  },

  async login(loginId, password, totpToken) {
    const data = await adminApiClient.post(ADMIN_CONFIG.ENDPOINTS.AUTH_LOGIN, {
      loginId,
      password,
      totpToken
    });

    if (data.token) {
      adminApiClient.setToken(data.token);
      adminStore.setState({
        isAuthenticated: true,
        currentLoginId: data.loginId || loginId
      });
    }
    return data;
  },

  async logout() {
    try {
      await adminApiClient.post(ADMIN_CONFIG.ENDPOINTS.AUTH_LOGOUT, {});
    } catch {}
    adminApiClient.setToken(null);
    adminStore.setState({ isAuthenticated: false });
  },

  async getSetupInfo() {
    return await adminApiClient.get(ADMIN_CONFIG.ENDPOINTS.AUTH_SETUP);
  },

  async generateNewSecret() {
    return await adminApiClient.get(ADMIN_CONFIG.ENDPOINTS.AUTH_NEW_SECRET);
  },

  async updateCredentials(payload) {
    return await adminApiClient.post(ADMIN_CONFIG.ENDPOINTS.AUTH_CREDENTIALS, payload);
  }
};
