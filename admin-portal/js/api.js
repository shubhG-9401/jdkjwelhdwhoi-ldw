import { ADMIN_CONFIG } from './config.js';
import { adminStore } from './state.js';

/**
 * Unified Admin API Client
 */
export const adminApiClient = {
  getToken() {
    return sessionStorage.getItem(ADMIN_CONFIG.TOKEN_KEY) || '';
  },

  setToken(token) {
    if (token) sessionStorage.setItem(ADMIN_CONFIG.TOKEN_KEY, token);
    else sessionStorage.removeItem(ADMIN_CONFIG.TOKEN_KEY);
  },

  getHeaders(isJson = true) {
    const headers = {};
    const token = this.getToken();
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    if (isJson) {
      headers['Content-Type'] = 'application/json';
    }
    return headers;
  },

  async request(url, options = {}) {
    const isJson = options.body && !(options.body instanceof FormData);
    const headers = {
      ...this.getHeaders(isJson),
      ...(options.headers || {})
    };

    const res = await fetch(url, {
      ...options,
      headers
    });

    if (res.status === 401) {
      this.setToken(null);
      adminStore.setState({ isAuthenticated: false });
      const loginModal = document.getElementById('admin-login-modal');
      if (loginModal) loginModal.classList.remove('hidden');
      throw new Error('Session expired or unauthorized. Please sign in.');
    }

    const contentType = res.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || `Request failed with status ${res.status}`);
      }
      return data;
    }

    if (!res.ok) {
      const text = await res.text();
      throw new Error(text || `Request failed with status ${res.status}`);
    }

    return res;
  },

  get(url) {
    return this.request(url, { method: 'GET' });
  },

  post(url, data) {
    const isFormData = data instanceof FormData;
    return this.request(url, {
      method: 'POST',
      body: isFormData ? data : JSON.stringify(data)
    });
  },

  put(url, data) {
    return this.request(url, {
      method: 'PUT',
      body: JSON.stringify(data)
    });
  },

  delete(url) {
    return this.request(url, { method: 'DELETE' });
  }
};
