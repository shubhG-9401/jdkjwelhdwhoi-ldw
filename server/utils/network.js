/**
 * Extracts and normalizes both IPv4 and IPv6 addresses from Express request headers and socket.
 * Handles reverse proxies, Cloudflare headers, and dual-stack localhost.
 * 
 * @param {import('express').Request} req
 * @returns {{ ipv4: string, ipv6: string, combined: string }}
 */
export function getClientIps(req) {
  const cfIp = req.headers['cf-connecting-ip'];
  const realIp = req.headers['x-real-ip'];
  const clientIp = req.headers['x-client-ip'];
  const forwarded = req.headers['x-forwarded-for'];
  const socketIp = req.socket?.remoteAddress;

  const candidates = [cfIp, realIp, clientIp, forwarded, socketIp].filter(Boolean);
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

  for (const rawIp of ips) {
    let clean = rawIp.trim();
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
    combined: `${ipv4 || '127.0.0.1'} / ${ipv6 || '::1'}`
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
