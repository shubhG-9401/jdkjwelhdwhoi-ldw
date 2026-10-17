/**
 * Student App Centralized Reactive State Store
 */

class StudentStore {
  constructor() {
    this.state = {
      encryptedBuffer: null,
      parsedMeta: null,
      licenseKey: '',
      hwid: this.generateClientHwid(),
      clientIpv4: '127.0.0.1',
      clientIpv6: null,
      activeCourseData: null,
      currentLesson: null,
      completedLessonIds: new Set(),
      isUnlocked: false
    };
    this.listeners = new Map();
  }

  generateClientHwid() {
    try {
      const stored = localStorage.getItem('drm_client_hwid');
      if (stored) return stored;
      const nav = window.navigator;
      const screen = window.screen;
      const entropy = `${nav.userAgent}|${screen.colorDepth}|${screen.width}x${screen.height}|${nav.hardwareConcurrency || 4}|${nav.platform || 'Win32'}`;
      let hash = 0;
      for (let i = 0; i < entropy.length; i++) {
        hash = ((hash << 5) - hash) + entropy.charCodeAt(i);
        hash |= 0;
      }
      const hwid = 'PC-' + Math.abs(hash).toString(36).toUpperCase() + '-WIN64';
      localStorage.setItem('drm_client_hwid', hwid);
      return hwid;
    } catch {
      return 'PC-' + Math.random().toString(36).substring(2, 10).toUpperCase() + '-WIN64';
    }
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

  markLessonCompleted(lessonId, isCompleted = true) {
    const set = new Set(this.state.completedLessonIds);
    if (isCompleted) set.add(lessonId);
    else set.delete(lessonId);
    this.setState({ completedLessonIds: set });

    const courseId = this.state.activeCourseData?.courseId || this.state.parsedMeta?.courseId || 'crs_default';
    try {
      localStorage.setItem(`drm_completed_${courseId}`, JSON.stringify(Array.from(set)));
    } catch {}
  }

  loadCompletedLessons(courseId) {
    const cid = courseId || this.state.activeCourseData?.courseId || this.state.parsedMeta?.courseId || 'crs_default';
    try {
      const raw = localStorage.getItem(`drm_completed_${cid}`);
      if (raw) {
        const arr = JSON.parse(raw);
        const set = new Set(arr);
        this.setState({ completedLessonIds: set });
        return set;
      }
    } catch {}
    return this.state.completedLessonIds;
  }

  isLessonCompleted(lessonId) {
    return this.state.completedLessonIds.has(lessonId);
  }
}

export const studentStore = new StudentStore();
