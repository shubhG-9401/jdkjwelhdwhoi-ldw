// Automated Verification Test Suite for Secure Course DRM Platform
// Run with: npm test (requires server running on port 3000)

async function runTests() {
  console.log('--- STARTING VERIFICATION TEST SUITE ---');
  let failures = 0;

  async function check(name, fn) {
    try {
      const res = await fn();
      console.log(`Test [${name}]: PASS`, res || '');
    } catch (err) {
      failures++;
      console.error(`Test [${name}]: FAIL ->`, err.message);
    }
  }

  // 1. Health endpoint check
  await check('Health Check', async () => {
    const res = await fetch('http://localhost:3000/api/health');
    if (!res.ok) throw new Error(`Status ${res.status}`);
    const data = await res.json();
    if (data.status !== 'online') throw new Error('Status not online');
    return data.version;
  });

  // 2. Admin HTML serving
  await check('Admin HTML Serving', async () => {
    const res = await fetch('http://localhost:3000/admin');
    if (!res.ok) throw new Error(`Status ${res.status}`);
    const text = await res.text();
    if (!text.includes('CourseDRM Admin Portal')) throw new Error('Admin title missing');
  });

  // 3. Admin JS Module serving
  await check('Admin JS Module Serving', async () => {
    const res = await fetch('http://localhost:3000/admin/app.js');
    if (!res.ok) throw new Error(`Status ${res.status}`);
    const text = await res.text();
    if (!text.includes('adminStore')) throw new Error('adminStore missing');
  });

  // 4. Student HTML serving
  await check('Student HTML Serving', async () => {
    const res = await fetch('http://localhost:3000/student');
    if (!res.ok) throw new Error(`Status ${res.status}`);
    const text = await res.text();
    if (!text.includes('Secure Course Player')) throw new Error('Student title missing');
  });

  // 5. Student JS Module serving
  await check('Student JS Module Serving', async () => {
    const res = await fetch('http://localhost:3000/student/app.js');
    if (!res.ok) throw new Error(`Status ${res.status}`);
    const text = await res.text();
    if (!text.includes('studentStore')) throw new Error('studentStore missing');
  });

  // 5a. Anti-Screenshare & DRM Watermark Engine Verification
  await check('Anti-Screenshare DRM Defense & Watermark Engine', async () => {
    // Check student player HTML features
    const htmlRes = await fetch('http://localhost:3000/student');
    const html = await htmlRes.text();
    if (!html.includes('id="drm-watermark-canvas"')) throw new Error('Missing drm-watermark-canvas in student HTML');
    if (!html.includes('disablePictureInPicture')) throw new Error('Missing disablePictureInPicture attribute on video');
    if (!html.includes('disableRemotePlayback')) throw new Error('Missing disableRemotePlayback attribute on video');
    if (!html.includes('controlsList="nodownload noplaybackrate noremoteplayback"')) throw new Error('Missing hardened controlsList');
    if (!html.includes('Zoom') || !html.includes('Google Meet')) throw new Error('Missing anti-screenshare notice in screen shield');

    // Check player.js forensic watermark engine
    const playerRes = await fetch('http://localhost:3000/student/js/player.js');
    const playerJs = await playerRes.text();
    if (!playerJs.includes('startWatermarkEngine')) throw new Error('Missing startWatermarkEngine in player.js');
    if (!playerJs.includes('drawSecurityBadge')) throw new Error('Missing drawSecurityBadge in player.js');
    if (!playerJs.includes('Anti-Capture Temporal Strobe')) throw new Error('Missing Anti-Capture Temporal Strobe in player.js');

    // Check security.js traps
    const secRes = await fetch('http://localhost:3000/student/js/security.js');
    const secJs = await secRes.text();
    if (!secJs.includes('setupExtendedDisplayCheck')) throw new Error('Missing setupExtendedDisplayCheck in security.js');
    if (!secJs.includes('setupAudioInterruptionDetector')) throw new Error('Missing setupAudioInterruptionDetector in security.js');
    if (!secJs.includes('captureStream')) throw new Error('Missing captureStream traps in security.js');
    return 'DRM Canvas, Temporal Strobe & Screen Shield verified';
  });

  // 5b. Pre-landing Mobile & Phone Desktop Site Blocker
  await check('Pre-Landing Mobile & Desktop Site Blocker', async () => {
    // 1. iPhone standard mobile attempt -> 403
    const iphoneRes = await fetch('http://localhost:3000/student', {
      headers: { 'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148' }
    });
    if (iphoneRes.status !== 403) throw new Error(`Expected HTTP 403 for iPhone standard mobile, got ${iphoneRes.status}`);
    const iphoneText = await iphoneRes.text();
    if (!iphoneText.includes('Desktop Site Required')) throw new Error('Missing Desktop Site Required block message');

    // 2. Android standard mobile attempt -> 403
    const androidRes = await fetch('http://localhost:3000/student/index.html', {
      headers: { 'User-Agent': 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Mobile Safari/537.36' }
    });
    if (androidRes.status !== 403) throw new Error(`Expected HTTP 403 for Android standard mobile, got ${androidRes.status}`);

    // 3. Mobile Client Hint Sec-CH-UA-Mobile: ?1 -> 403
    const chRes = await fetch('http://localhost:3000/student', {
      headers: { 'Sec-CH-UA-Mobile': '?1' }
    });
    if (chRes.status !== 403) throw new Error(`Expected HTTP 403 for Sec-CH-UA-Mobile: ?1, got ${chRes.status}`);

    // 4. Android "Desktop Site" Mode attempt -> 200 OK (OPENED!)
    const androidDesktopRes = await fetch('http://localhost:3000/student', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Sec-CH-UA-Platform': '"Android"',
        'Sec-CH-UA-Mobile': '?0'
      }
    });
    if (androidDesktopRes.status !== 200) throw new Error(`Expected HTTP 200 for Android Desktop Site, got ${androidDesktopRes.status}`);
    const androidDesktopText = await androidDesktopRes.text();
    if (!androidDesktopText.includes('Secure Course Player')) throw new Error('Expected student player HTML for mobile desktop site');

    // 5. iPhone "Request Desktop Website" Mode attempt -> 200 OK (OPENED!)
    const iphoneDesktopRes = await fetch('http://localhost:3000/student', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15'
      }
    });
    if (iphoneDesktopRes.status !== 200) throw new Error(`Expected HTTP 200 for iPhone Desktop Website mode, got ${iphoneDesktopRes.status}`);

    return 'Standard mobile blocked (403), Mobile Desktop Site successfully opened (200 OK)';
  });

  // 6. Admin Auth with stateless token
  let adminToken = '';
  await check('Admin Stateless Auth', async () => {
    const { createAdminToken } = await import('./server/utils/token.js');
    adminToken = createAdminToken('shubhg9401');

    const res = await fetch('http://localhost:3000/api/auth/status', {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    if (!res.ok) throw new Error(`Status ${res.status}`);
    const data = await res.json();
    if (!data.authenticated || data.loginId !== 'shubhg9401') throw new Error(`Unexpected user: ${data.loginId}`);
    return data.loginId;
  });

  // 7. Courses listing
  let activeCourseId = 'crs_sigma12';
  await check('Courses List', async () => {
    const res = await fetch('http://localhost:3000/api/courses', {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    if (!res.ok) throw new Error(`Status ${res.status}`);
    const data = await res.json();
    if (data.courses && data.courses.length > 0) {
      activeCourseId = data.courses[0].id;
    }
    return `Count: ${data.courses.length} (Using: ${activeCourseId})`;
  });

  // 8. 56-Character License Generation
  let generatedKey = '';
  await check('Issue 56-Char License', async () => {
    const res = await fetch('http://localhost:3000/api/licenses/issue', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`
      },
      body: JSON.stringify({
        courseId: activeCourseId,
        customerName: 'Verification Suite Test Student',
        durationDays: 365,
        bindIp: true,
        bindHwid: true
      })
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(`Status ${res.status}: ${err.error || ''}`);
    }
    const data = await res.json();
    generatedKey = data.license.licenseKey;
    if (!generatedKey || generatedKey.length !== 56) {
      throw new Error(`Expected 56-char key, got length: ${generatedKey ? generatedKey.length : 0}`);
    }
    return `Key: ${generatedKey.substring(0, 10)}... (Length: ${generatedKey.length})`;
  });

  // 9. Standard Mobile Rejection (403) & Mobile Desktop Site Acceptance (200)
  await check('Mobile Standard Block 403 & Desktop Site Allowed 200', async () => {
    // A. Standard Mobile UA -> 403 Forbidden
    const res1 = await fetch('http://localhost:3000/api/client/activate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_5 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148'
      },
      body: JSON.stringify({
        courseId: activeCourseId,
        licenseKey: generatedKey,
        hwid: 'mobile-fake-hwid'
      })
    });
    if (res1.status !== 403) throw new Error(`Expected 403 for standard mobile UA, got ${res1.status}`);

    // B. Mobile with Desktop Site Mode Enabled -> 200 OK
    const res2 = await fetch('http://localhost:3000/api/client/activate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Sec-CH-UA-Mobile': '?0',
        'Sec-CH-UA-Platform': '"Android"'
      },
      body: JSON.stringify({
        courseId: activeCourseId,
        licenseKey: generatedKey,
        hwid: 'test-pc-hwid-998877',
        screenShortSide: 390,
        isPhoneDevice: false
      })
    });
    if (res2.status !== 200) {
      const err = await res2.json();
      throw new Error(`Expected 200 for Mobile Desktop Site activation, got ${res2.status}: ${err.error}`);
    }

    return 'Standard mobile blocked (403), Mobile Desktop Site activation accepted (200 OK)';
  });

  // 10. PC Client Activation (200 OK)
  let streamToken = '';
  await check('PC Client Activation', async () => {
    const res = await fetch('http://localhost:3000/api/client/activate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36'
      },
      body: JSON.stringify({
        courseId: activeCourseId,
        licenseKey: generatedKey,
        hwid: 'test-pc-hwid-998877',
        screenShortSide: 1080,
        isPhoneDevice: false
      })
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(`Activation failed: ${err.error || res.status}`);
    }
    const data = await res.json();
    streamToken = data.streamToken;
    if (!streamToken) throw new Error('Missing streamToken in activation response');
    return `Course: ${data.courseTitle}`;
  });

  // 11. DRM Stream Proxy Token Verification
  const verifiedStreamUrl = 'https://embed-cloudfront.wistia.com/deliveries/45ed8874a993895cdec4c4ab62e03ed3123f94b9.m3u8';
  await check('DRM Stream Proxy', async () => {
    const res = await fetch(`http://localhost:3000/api/drm/stream/playlist.m3u8?token=${encodeURIComponent(streamToken)}&url=${encodeURIComponent(verifiedStreamUrl)}`);
    if (!res.ok) throw new Error(`Stream proxy failed with status: ${res.status}`);
    return `Content-Type: ${res.headers.get('content-type')}`;
  });

  // 12. DRM Stream Token Rejection without valid token
  await check('DRM Stream Proxy Rejection (403)', async () => {
    const res = await fetch(`http://localhost:3000/api/drm/stream/playlist.m3u8?url=${encodeURIComponent(verifiedStreamUrl)}`);
    if (res.status !== 403) throw new Error(`Expected 403, got ${res.status}`);
    return '403 Forbidden as expected';
  });

  // 13. System Status API Check
  await check('System Status API', async () => {
    const res = await fetch('http://localhost:3000/api/system/status');
    if (!res.ok) throw new Error(`Status ${res.status}`);
    const data = await res.json();
    if (!data.success || !data.storageProvider) throw new Error('Invalid system status response');
    return `Provider: ${data.storageProvider} (Licenses: ${data.licenseCount})`;
  });

  // 14. Real-Time Security Event Feed & IPv6 Public IP Verification
  await check('Security Event Feed & IPv6 API', async () => {
    const res = await fetch('http://localhost:3000/api/logs?limit=10', {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    if (!res.ok) throw new Error(`Status ${res.status}`);
    const data = await res.json();
    if (!data.success || !Array.isArray(data.logs)) throw new Error('Invalid logs response');
    const firstLog = data.logs[0];
    if (!firstLog || !('ipv4' in firstLog) || !('ipv6' in firstLog)) {
      throw new Error('Logs missing separated ipv4 or ipv6 telemetry fields');
    }
    return `Verified ${data.logs.length} events with IPv4 & IPv6 telemetry`;
  });

  // 14b. Public IPv6 Dual-Stack Resolution & Binding Test
  let dualStackKey = '';
  await check('Public IPv6 Dual-Stack Binding', async () => {
    // 1. Issue test license
    const issueRes = await fetch('http://localhost:3000/api/licenses/issue', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({
        courseId: activeCourseId,
        customerName: 'IPv6 Test Student',
        durationDays: 30,
        bindIp: true,
        bindHwid: true
      })
    });
    const issueData = await issueRes.json();
    dualStackKey = issueData.license.licenseKey;

    // 2. Activate simulating Indian mobile ISP (Airtel/Jio) with public IPv4 & public IPv6
    const actRes = await fetch('http://localhost:3000/api/client/activate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Forwarded-For': '182.77.71.147',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36'
      },
      body: JSON.stringify({
        courseId: activeCourseId,
        licenseKey: dualStackKey,
        hwid: 'hwid-ipv6-student-99',
        clientIpv4: '182.77.71.147',
        clientIpv6: '2401:4900:8f5c:2ded:84a3:57d9:899c:7056',
        screenShortSide: 1080,
        isPhoneDevice: false
      })
    });
    if (!actRes.ok) {
      const err = await actRes.json();
      throw new Error(`Activation failed: ${err.error || actRes.status}`);
    }
    const actData = await actRes.json();
    if (actData.studentInfo.boundIpv4 !== '182.77.71.147') {
      throw new Error(`Expected bound IPv4 182.77.71.147, got ${actData.studentInfo.boundIpv4}`);
    }
    if (actData.studentInfo.boundIpv6 !== '2401:4900:8f5c:2ded:84a3:57d9:899c:7056') {
      throw new Error(`Expected bound IPv6 2401:4900:..., got ${actData.studentInfo.boundIpv6}`);
    }

    // 3. Check security logs
    const logRes = await fetch('http://localhost:3000/api/logs?limit=5', {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    const logData = await logRes.json();
    const actLog = logData.logs.find(l => l.licenseKey === dualStackKey);
    if (!actLog || actLog.ipv6 !== '2401:4900:8f5c:2ded:84a3:57d9:899c:7056') {
      throw new Error('Log does not contain real public IPv6');
    }

    // 4. Cleanup dual stack test key
    await fetch(`http://localhost:3000/api/system/licenses/${dualStackKey}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${adminToken}` }
    });

    return `Bound IPv4: ${actData.studentInfo.boundIpv4} | IPv6: ${actData.studentInfo.boundIpv6}`;
  });

  // 15. Test License Cleanup (Delete mock test key so it does not pollute production DB)
  if (generatedKey) {
    await check('Test License Cleanup', async () => {
      const res = await fetch(`http://localhost:3000/api/system/licenses/${generatedKey}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${adminToken}` }
      });
      if (!res.ok) throw new Error(`Status ${res.status}`);
      const data = await res.json();
      if (!data.success) throw new Error('Failed to delete test key');
      return 'Mock test key safely removed from data store';
    });
  }

  console.log('\n----------------------------------------');
  if (failures === 0) {
    console.log('--- ALL 18 TESTS PASSED PERFECTLY ---');
    process.exit(0);
  } else {
    console.error(`--- ${failures} TESTS FAILED ---`);
    process.exit(1);
  }
}

runTests();

