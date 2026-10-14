/**
 * Admin Portal Configuration & Constants
 */

export const ADMIN_CONFIG = {
  TOKEN_KEY: 'admin_token',
  API_BASE: '/api/admin',
  LICENSE_KEY_LENGTH: 56,
  ENDPOINTS: {
    AUTH_STATUS: '/api/admin/auth/status',
    AUTH_LOGIN: '/api/admin/auth/login',
    AUTH_LOGOUT: '/api/admin/auth/logout',
    AUTH_SETUP: '/api/admin/auth/setup-info',
    AUTH_NEW_SECRET: '/api/admin/auth/generate-new-secret',
    AUTH_CREDENTIALS: '/api/admin/auth/update-credentials',

    COURSES: '/api/admin/courses',
    COURSES_PREVIEW: '/api/admin/courses/preview-doc',
    COURSES_ENCRYPT: '/api/admin/courses/encrypt',

    LICENSES: '/api/admin/licenses',
    LOGS: '/api/admin/logs'
  }
};
