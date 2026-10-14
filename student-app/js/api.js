/**
 * Student App API Service
 * Handles all DRM server communication with robust error handling.
 */

export const studentApi = {
  /**
   * Inspects an encrypted file's header on the server.
   */
  async inspectFile(fileBlob) {
    const formData = new FormData();
    formData.append('encFile', fileBlob);

    const res = await fetch('/api/client/inspect-file', {
      method: 'POST',
      body: formData
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to inspect file');
    return data;
  },

  /**
   * Verifies 56-character license key, IP, and HWID with DRM server.
   */
  async activate(payload) {
    const res = await fetch('/api/client/activate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Activation rejected');
    return data;
  },

  /**
   * Sends heartbeat continuity ping.
   */
  async heartbeat(payload) {
    const res = await fetch('/api/client/heartbeat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    if (!res.ok || !data.valid) {
      throw new Error(data.reason || 'Session expired or invalidated.');
    }
    return data;
  },

  /**
   * Alerts the DRM server of any DevTools / tampering attempts.
   */
  async sendTamperAlert(licenseKey, hwid, reason) {
    try {
      await fetch('/api/client/tamper-alert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ licenseKey, hwid, reason })
      });
    } catch {}
  },

  /**
   * Auto-loads a pre-packaged course .enc file from the server.
   */
  async downloadPrepackagedCourse(courseId = 'crs_sigma12') {
    const res = await fetch(`/api/admin/courses/${courseId}/download`);
    if (!res.ok) throw new Error('Could not fetch pre-packaged course from server.');
    const arrayBuf = await res.arrayBuffer();
    return new Uint8Array(arrayBuf);
  }
};
