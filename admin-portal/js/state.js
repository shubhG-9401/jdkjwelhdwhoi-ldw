/**
 * Admin Portal Centralized Reactive State Store
 */

class AdminStore {
  constructor() {
    this.state = {
      isAuthenticated: false,
      currentLoginId: 'admin',
      courses: [],
      licenses: [],
      securityLogs: [],
      adminSecurityInfo: null,
      selectedFiles: [],
      activeEditingCourseId: null
    };
    this.listeners = new Map();
  }

  getState() {
    return this.state;
  }

  setState(updates) {
    const prev = { ...this.state };
    this.state = { ...this.state, ...updates };

    for (const [key, value] of Object.entries(updates)) {
      if (this.listeners.has(key)) {
        this.listeners.get(key).forEach(fn => fn(value, prev[key]));
      }
    }

    if (this.listeners.has('*')) {
      this.listeners.get('*').forEach(fn => fn(this.state, prev));
    }
  }

  subscribe(key, fn) {
    if (!this.listeners.has(key)) {
      this.listeners.set(key, new Set());
    }
    this.listeners.get(key).add(fn);
    return () => this.listeners.get(key).delete(fn);
  }
}

export const adminStore = new AdminStore();
