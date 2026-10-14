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
   * Queries real dual-stack IPv4 and IPv6 detected by server and client probes.
   */
  async getMyIp() {
    let ipv4 = '127.0.0.1';
    let ipv6 = null;

    // 1. Query server detected IPs first
    try {
      const res = await fetch('/api/client/my-ip', { signal: AbortSignal.timeout(3000) });
      if (res.ok) {
        const data = await res.json();
        if (data.ipv4) ipv4 = data.ipv4;
        if (data.ipv6 && data.ipv6 !== '::1') ipv6 = data.ipv6;
      }
    } catch {}

    // 2. Client-side public IPv6 resolution probe (if server didn't detect a public IPv6)
    if (!ipv6 || ipv6 === '::1') {
      try {
        const v6Res = await fetch('https://api6.ipify.org?format=json', { signal: AbortSignal.timeout(2500) });
        if (v6Res.ok) {
          const v6Data = await v6Res.json();
          if (v6Data && v6Data.ip && v6Data.ip.includes(':')) {
            ipv6 = v6Data.ip;
          }
        }
      } catch {
        // Fallback IPv6 probe
        try {
          const v6Fallback = await fetch('https://v6.ident.me', { signal: AbortSignal.timeout(2000) });
          if (v6Fallback.ok) {
            const rawV6 = (await v6Fallback.text()).trim();
            if (rawV6.includes(':') && rawV6 !== '::1') {
              ipv6 = rawV6;
            }
          }
        } catch {}
      }
    }

    // 3. Client-side public IPv4 resolution probe (if server only saw localhost loopback 127.0.0.1)
    if (ipv4 === '127.0.0.1') {
      try {
        const v4Res = await fetch('https://api4.ipify.org?format=json', { signal: AbortSignal.timeout(2000) });
        if (v4Res.ok) {
          const v4Data = await v4Res.json();
          if (v4Data && v4Data.ip && v4Data.ip.includes('.')) {
            ipv4 = v4Data.ip;
          }
        }
      } catch {}
    }

    // Localhost fallback
    if (!ipv4 && !ipv6) {
      ipv4 = '127.0.0.1';
      ipv6 = '::1';
    } else if (ipv4 === '127.0.0.1' && !ipv6) {
      ipv6 = '::1';
    }

    return {
      ipv4,
      ipv6: ipv6 || null,
      combined: ipv6 ? `${ipv4} / ${ipv6}` : ipv4
    };
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
