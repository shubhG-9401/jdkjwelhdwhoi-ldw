import { isMobileDevice, getClientIps } from '../utils/network.js';
import { db } from '../db.js';

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Server-Side Mobile Blocker Middleware
 * Intercepts requests attempting to access the Student Portal on mobile phones and tablets.
 * Blocks them BEFORE any student portal HTML, JS, CSS, or course assets can be downloaded or rendered.
 */
export function mobileBlocker(req, res, next) {
  if (!isMobileDevice(req)) {
    return next();
  }

  const { ipv4, ipv6 } = getClientIps(req);
  const ua = req.headers['user-agent'] || 'Unknown Handheld Device';

  // Audit log the mobile intrusion attempt
  try {
    db.addLog({
      action: 'student_portal_blocked_mobile',
      status: 'rejected_mobile_device',
      ip: `${ipv4} / ${ipv6}`,
      message: `Blocked mobile device before landing on student portal (${req.originalUrl || req.url}). UA: ${ua.substring(0, 100)}`
    });
  } catch (err) {
    console.warn('[MOBILE BLOCK LOG WARN]', err.message);
  }

  // Prevent caching of the block response
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0');
  res.setHeader('X-Content-Type-Options', 'nosniff');

  // Handle API/JSON requests
  if (req.originalUrl.startsWith('/api') || (req.accepts('json') && !req.accepts('html'))) {
    return res.status(403).json({
      error: 'ACCESS DENIED: Windows PC Required. Course playback and student portal are strictly prohibited on mobile devices and tablets.',
      blocked: true,
      device: 'Mobile / Tablet',
      ip: `${ipv4} / ${ipv6}`
    });
  }

  // Serve premium standalone access-denied screen
  res.status(403).type('html').send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <title>Access Denied - Windows PC Required</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background-color: #030712;
      color: #f3f4f6;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 1.25rem;
      line-height: 1.5;
    }
    .card {
      background: #0f172a;
      border: 1px solid #1e293b;
      border-radius: 1.5rem;
      padding: 2.25rem 1.75rem;
      max-width: 440px;
      width: 100%;
      text-align: center;
      box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.75);
      animation: fadeIn 0.4s ease-out;
    }
    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(12px) scale(0.98); }
      to { opacity: 1; transform: translateY(0) scale(1); }
    }
    .icon-wrapper {
      width: 4.5rem;
      height: 4.5rem;
      margin: 0 auto 1.25rem auto;
      border-radius: 1.25rem;
      background: rgba(239, 68, 68, 0.12);
      border: 1px solid rgba(239, 68, 68, 0.25);
      display: flex;
      align-items: center;
      justify-content: center;
      color: #ef4444;
    }
    .badge {
      display: inline-block;
      padding: 0.3rem 0.85rem;
      border-radius: 9999px;
      font-size: 0.72rem;
      font-weight: 700;
      letter-spacing: 0.05em;
      text-transform: uppercase;
      background: rgba(239, 68, 68, 0.18);
      color: #f87171;
      border: 1px solid rgba(239, 68, 68, 0.3);
      margin-bottom: 0.85rem;
    }
    h1 {
      font-size: 1.4rem;
      font-weight: 800;
      letter-spacing: -0.02em;
      color: #ffffff;
      margin-bottom: 0.35rem;
    }
    .subtitle {
      font-size: 0.85rem;
      color: #94a3b8;
      margin-bottom: 1.5rem;
    }
    .info-box {
      background: #030712;
      border: 1px solid #1e293b;
      border-radius: 1rem;
      padding: 1.1rem 1.15rem;
      text-align: left;
      font-size: 0.8rem;
      color: #cbd5e1;
      margin-bottom: 1.25rem;
      display: flex;
      flex-direction: column;
      gap: 0.85rem;
    }
    .info-row {
      display: flex;
      align-items: flex-start;
      gap: 0.65rem;
    }
    .info-icon {
      flex-shrink: 0;
      width: 1.15rem;
      height: 1.15rem;
      margin-top: 0.1rem;
    }
    .text-red { color: #f87171; }
    .text-indigo { color: #818cf8; }
    .audit-grid {
      background: #0b0f19;
      border: 1px dashed #334155;
      border-radius: 0.75rem;
      padding: 0.85rem;
      margin-bottom: 1.5rem;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      font-size: 0.7rem;
      text-align: left;
      color: #64748b;
      display: flex;
      flex-direction: column;
      gap: 0.35rem;
    }
    .audit-grid span { color: #94a3b8; }
    .footer-note {
      font-size: 0.78rem;
      color: #64748b;
      line-height: 1.45;
    }
    .footer-note strong {
      color: #cbd5e1;
    }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon-wrapper">
      <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <rect x="5" y="2" width="14" height="20" rx="2" ry="2"></rect>
        <line x1="12" y1="18" x2="12.01" y2="18"></line>
        <line x1="2" y1="2" x2="22" y2="22" stroke="#ef4444" stroke-width="2.5"></line>
      </svg>
    </div>

    <div class="badge">Mobile & Desktop Site Blocked</div>
    <h1>Windows PC Required</h1>
    <p class="subtitle">Course playback cannot run on mobile phones, even in "Desktop Site" mode.</p>

    <div class="info-box">
      <div class="info-row">
        <svg class="info-icon text-red" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10"></circle>
          <line x1="12" y1="8" x2="12" y2="12"></line>
          <line x1="12" y1="16" x2="12.01" y2="16"></line>
        </svg>
        <div>
          <strong style="color: #f1f5f9;">Phone & Desktop Site Blocked:</strong> Smartphones, tablets, and mobile browsers using "Desktop Site" / "Desktop View" are strictly prohibited from viewing or downloading course curriculum.
        </div>
      </div>
      <div class="info-row">
        <svg class="info-icon text-indigo" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect>
          <line x1="8" y1="21" x2="16" y2="21"></line>
          <line x1="12" y1="17" x2="12" y2="21"></line>
        </svg>
        <div>
          <strong style="color: #f1f5f9;">DRM Protection:</strong> In-memory AES stream decryption, screenshot blocking, and single-device locking require an authorized <strong>Windows PC or Laptop</strong>.
        </div>
      </div>
    </div>

    <div class="audit-grid">
      <div>Security Status: <span style="color: #f87171;">HTTP 403 Forbidden</span></div>
      <div>Client IP: <span>${escapeHtml(ipv4)} / ${escapeHtml(ipv6)}</span></div>
      <div>Device Type: <span>Smartphone / Handheld Device</span></div>
      <div>Policy: <span>Strict Windows PC Desktop Only</span></div>
    </div>

    <p class="footer-note">
      Please copy your course URL and access it using Google Chrome, Microsoft Edge, or the Course Player on your <strong>Windows PC or Laptop</strong>.
    </p>
  </div>
</body>
</html>`);
}
