/**
 * Validates whether an IP address is a public, routable IPv4 address.
 * 
 * @param {string} ip
 * @returns {boolean}
 */
export function isPublicIpv4(ip) {
  if (!ip || typeof ip !== 'string') return false;
  const clean = ip.trim();
  const parts = clean.split('.');
  if (parts.length !== 4) return false;
  for (const p of parts) {
    const num = parseInt(p, 10);
    if (isNaN(num) || num < 0 || num > 255) return false;
  }
  // Exclude loopback and private networks
  if (clean === '127.0.0.1' || clean.startsWith('127.')) return false;
  if (clean.startsWith('10.') || clean.startsWith('192.168.')) return false;
  if (/^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(clean)) return false;
  return true;
}

/**
 * Validates whether an IP address is a public, routable IPv6 address (not loopback ::1 or link-local).
 * 
 * @param {string} ip
 * @returns {boolean}
 */
export function isPublicIpv6(ip) {
  if (!ip || typeof ip !== 'string') return false;
  const clean = ip.trim().toLowerCase();
  if (!clean.includes(':')) return false;
  if (clean === '::1' || clean === '::' || clean === '0:0:0:0:0:0:0:1') return false;
  if (clean.startsWith('fe80:') || clean.startsWith('fc00:') || clean.startsWith('fd00:')) return false;
  return true;
}

/**
 * Extracts and normalizes both IPv4 and IPv6 addresses from Express request headers and socket.
 * Handles reverse proxies, Cloudflare headers, Vercel edge headers, and dual-stack localhost.
 * 
 * @param {import('express').Request} req
 * @returns {{ ipv4: string, ipv6: string | null, combined: string }}
 */
export function getClientIps(req) {
  const cfIpv6 = req.headers['cf-connecting-ipv6'];
  const cfIp = req.headers['cf-connecting-ip'];
  const trueClientIp = req.headers['true-client-ip'];
  const realIp = req.headers['x-real-ip'];
  const clientIp = req.headers['x-client-ip'];
  const forwarded = req.headers['x-forwarded-for'];
  const vercelForwarded = req.headers['x-vercel-forwarded-for'];
  const socketIp = req.socket?.remoteAddress;

  const candidates = [cfIpv6, cfIp, trueClientIp, vercelForwarded, realIp, clientIp, forwarded, socketIp].filter(Boolean);
  let ips = [];

  for (const c of candidates) {
    if (typeof c === 'string') {
      ips.push(...c.split(',').map(s => s.trim()));
    } else if (Array.isArray(c)) {
      ips.push(...c);
    }
  }
  if (ips.length === 0) ips.push('127.0.0.1');

  let ipv4 = null;
  let ipv6 = null;
  let isLocalhost = false;

  for (const rawIp of ips) {
    let clean = rawIp.trim();
    if (clean.startsWith('::ffff:')) {
      clean = clean.substring(7);
    }

    if (clean === '::1' || clean === '127.0.0.1') {
      isLocalhost = true;
    } else if (clean.includes('.')) {
      if (!ipv4 && isPublicIpv4(clean)) {
        ipv4 = clean;
      } else if (!ipv4) {
        ipv4 = clean;
      }
    } else if (clean.includes(':')) {
      if (!ipv6 && isPublicIpv6(clean)) {
        ipv6 = clean;
      }
    }
  }

  // Handle localhost fallback if no public IPs were encountered
  if (!ipv4 && !ipv6) {
    ipv4 = '127.0.0.1';
    ipv6 = '::1';
  } else if (isLocalhost && !ipv4 && ipv6 === '::1') {
    ipv4 = '127.0.0.1';
  } else if (ipv4 === '127.0.0.1' && !ipv6) {
    ipv6 = '::1';
  }

  // Formulate combined string
  let combined = ipv4 || '127.0.0.1';
  if (ipv6 && ipv6 !== '::1') {
    combined = ipv4 ? `${ipv4} / ${ipv6}` : ipv6;
  } else if (ipv4 === '127.0.0.1' && ipv6 === '::1') {
    combined = '127.0.0.1 / ::1';
  }

  return {
    ipv4: ipv4 || '127.0.0.1',
    ipv6: ipv6 || null,
    combined
  };
}

/**
 * Checks whether an incoming HTTP request originated from a mobile or tablet device,
 * including phones running in "Desktop Site" / "Request Desktop Website" mode.
 * 
 * @param {import('express').Request} req
 * @returns {boolean}
 */
export function isMobileDevice(req) {
  if (!req || !req.headers) return false;

  // 1. Modern Client Hints (Sent even in Desktop Site mode on Chrome / Edge)
  const chMobile = req.headers['sec-ch-ua-mobile'];
  if (chMobile === '?1') return true;

  const chPlatform = String(req.headers['sec-ch-ua-platform'] || '').toLowerCase();
  if (chPlatform.includes('android') || chPlatform.includes('ios')) return true;

  const chModel = String(req.headers['sec-ch-ua-model'] || '').trim().replace(/"/g, '');
  if (chModel && chModel.length > 0) return true;

  const chFormFactors = String(req.headers['sec-ch-ua-form-factors'] || '').toLowerCase();
  if (chFormFactors.includes('mobile') || chFormFactors.includes('tablet')) return true;

  // 2. User-Agent evaluation (Includes handheld tokens and phone device models)
  const userAgent = String(req.headers['user-agent'] || '');
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Opera Mobi|Mobile|mobile|CriOS|FxiOS|EdgA|EdgIOS|Tablet|Silk|Kindle|PlayBook|BB10|Windows Phone|SM-[A-Z0-9]+|Pixel [0-9]+|Redmi|POCO/i.test(userAgent);
}
