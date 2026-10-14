import { adminApiClient } from '../api.js';
import { ADMIN_CONFIG } from '../config.js';
import { adminStore } from '../state.js';

export const courseService = {
  async loadCourses() {
    const data = await adminApiClient.get(ADMIN_CONFIG.ENDPOINTS.COURSES);
    if (data.success && Array.isArray(data.courses)) {
      adminStore.setState({ courses: data.courses });
    }
    return data.courses;
  },

  async previewDoc(formData) {
    return await adminApiClient.post(ADMIN_CONFIG.ENDPOINTS.COURSES_PREVIEW, formData);
  },

  async encryptCourse(formData) {
    const res = await adminApiClient.post(ADMIN_CONFIG.ENDPOINTS.COURSES_ENCRYPT, formData);
    await this.loadCourses();
    return res;
  },

  async updateCourse(courseId, payload) {
    const res = await adminApiClient.put(`${ADMIN_CONFIG.ENDPOINTS.COURSES}/${courseId}`, payload);
    await this.loadCourses();
    return res;
  },

  async deleteCourse(courseId) {
    const res = await adminApiClient.delete(`${ADMIN_CONFIG.ENDPOINTS.COURSES}/${courseId}`);
    await this.loadCourses();
    return res;
  }
};
