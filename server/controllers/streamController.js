import { validateClientSession } from './clientController.js';

export const streamController = {
  // Proxy Playlist: Rewrites segments so real URLs are never exposed in Network tab
  async getPlaylist(req, res) {
    const { token, url: rawTargetUrl } = req.query;
    const session = validateClientSession(token, req);
    if (!session) {
      return res.status(403).send('#EXTM3U\n#ERROR: Access Denied. Invalid or expired DRM token.');
    }

    if (!rawTargetUrl) {
      return res.status(400).send('#EXTM3U\n#ERROR: Target URL missing.');
    }

    let targetUrl = rawTargetUrl;
    if (!rawTargetUrl.startsWith('http://') && !rawTargetUrl.startsWith('https://')) {
      try {
        const decoded = Buffer.from(rawTargetUrl, 'base64').toString('utf8');
        if (decoded.startsWith('http://') || decoded.startsWith('https://')) {
          targetUrl = decoded;
        }
      } catch {
        return res.status(400).send('#EXTM3U\n#ERROR: Malformed target URL.');
      }
    }

    let upstreamRes;
    try {
      upstreamRes = await fetch(targetUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
        signal: AbortSignal.timeout(10000)
      });
      if (!upstreamRes.ok) {
        return res.status(upstreamRes.status).send('#EXTM3U\n#ERROR: Upstream stream unavailable.');
      }
    } catch (fetchErr) {
      return res.status(502).send(`#EXTM3U\n#ERROR: Upstream stream unreachable (${fetchErr.message}).`);
    }

    const playlistText = await upstreamRes.text();
    const urlObj = new URL(targetUrl);
    const baseUrl = `${urlObj.protocol}//${urlObj.host}`;

    // Rewrite segment URLs to go through our DRM stream proxy
    const lines = playlistText.split('\n');
    const rewrittenLines = lines.map(line => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) return line;

      let segmentUrl = trimmed;
      if (trimmed.startsWith('/')) {
        segmentUrl = `${baseUrl}${trimmed}`;
      } else if (!trimmed.startsWith('http://') && !trimmed.startsWith('https://')) {
        const basePath = targetUrl.substring(0, targetUrl.lastIndexOf('/') + 1);
        segmentUrl = `${basePath}${trimmed}`;
      }

      // Obfuscate segment URL with base64
      const b64Seg = Buffer.from(segmentUrl, 'utf8').toString('base64');
      return `/api/drm/stream/segment.ts?token=${encodeURIComponent(token)}&seg=${encodeURIComponent(b64Seg)}`;
    });

    res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.send(rewrittenLines.join('\n'));
  },

  // Proxy Video Segment: Streams segment bytes without exposing origin
  async getSegment(req, res) {
    const { token, seg } = req.query;
    const session = validateClientSession(token, req);
    if (!session) {
      return res.status(403).send('Forbidden: Invalid DRM Token');
    }

    if (!seg) return res.status(400).send('Missing segment identifier');

    let segmentUrl;
    try {
      segmentUrl = Buffer.from(seg, 'base64').toString('utf8');
    } catch {
      return res.status(400).send('Malformed segment identifier');
    }

    const upstreamRes = await fetch(segmentUrl);
    if (!upstreamRes.ok) {
      return res.status(upstreamRes.status).send('Segment fetch error');
    }

    res.setHeader('Content-Type', 'video/MP2T');
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.setHeader('X-Content-Type-Options', 'nosniff');

    const arrayBuffer = await upstreamRes.arrayBuffer();
    res.send(Buffer.from(arrayBuffer));
  }
};
