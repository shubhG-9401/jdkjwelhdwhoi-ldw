/**
 * Extracts and normalizes both IPv4 and IPv6 addresses from Express request headers and socket.
 * Handles reverse proxies, Cloudflare headers, and dual-stack localhost.
 * 
 * @param {import('express').Request} req
 * @returns {{ ipv4: string, ipv6: string, combined: string }}
 */
export function getClientIps(req) {
  const rawHeader = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '127.0.0.1';
  let ips = [];

  if (typeof rawHeader === 'string') {
    ips = rawHeader.split(',').map(s => s.trim());
  } else if (Array.isArray(rawHeader)) {
    ips = rawHeader;
  }

  let ipv4 = null;
  let ipv6 = null;

  for (const rawIp of ips) {
    let clean = rawIp;
    if (clean.startsWith('::ffff:')) {
      clean = clean.substring(7);
    }

    if (clean === '::1' || clean === '127.0.0.1') {
      if (!ipv4) ipv4 = '127.0.0.1';
      if (!ipv6) ipv6 = '::1';
    } else if (clean.includes('.')) {
      if (!ipv4) ipv4 = clean;
    } else if (clean.includes(':')) {
      if (!ipv6) ipv6 = clean;
    }
  }

  return {
    ipv4: ipv4 || '127.0.0.1',
    ipv6: ipv6 || '::1',
    combined: `${ipv4 || '127.0.0.1'}`
  };
}

/**
 * Checks whether an incoming HTTP request originated from a mobile or tablet device.
 * 
 * @param {import('express').Request} req
 * @returns {boolean}
 */
export function isMobileDevice(req) {
  const userAgent = req.headers['user-agent'] || '';
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Mobile|mobile|CriOS/i.test(userAgent);
}
