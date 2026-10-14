import { adminApiClient } from '../api.js';
import { ADMIN_CONFIG } from '../config.js';
import { adminStore } from '../state.js';

export const licenseService = {
  async loadLicenses() {
    const data = await adminApiClient.get(ADMIN_CONFIG.ENDPOINTS.LICENSES);
    if (data.success && Array.isArray(data.licenses)) {
      adminStore.setState({ licenses: data.licenses });
    }
    return data.licenses;
  },

  async createLicense(payload) {
    const res = await adminApiClient.post(ADMIN_CONFIG.ENDPOINTS.LICENSES, payload);
    await this.loadLicenses();
    return res;
  },

  async revokeLicense(licenseKey) {
    const res = await adminApiClient.post(`${ADMIN_CONFIG.ENDPOINTS.LICENSES}/${licenseKey}/revoke`, {});
    await this.loadLicenses();
    return res;
  },

  async resetDeviceLock(licenseKey) {
    const res = await adminApiClient.post(`${ADMIN_CONFIG.ENDPOINTS.LICENSES}/${licenseKey}/reset-device`, {});
    await this.loadLicenses();
    return res;
  },

  async deleteLicense(licenseKey) {
    const res = await adminApiClient.post(`${ADMIN_CONFIG.ENDPOINTS.SYSTEM}/licenses/${licenseKey}/delete`, {});
    await this.loadLicenses();
    return res;
  }
};
