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

  // 5b. Pre-landing Mobile & Phone Desktop Site Blocker
  await check('Pre-Landing Mobile & Desktop Site Blocker', async () => {
    // 1. iPhone mobile attempt
    const iphoneRes = await fetch('http://localhost:3000/student', {
      headers: { 'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148' }
    });
    if (iphoneRes.status !== 403) throw new Error(`Expected HTTP 403 for iPhone, got ${iphoneRes.status}`);
    const iphoneText = await iphoneRes.text();
    if (!iphoneText.includes('Windows PC Required')) throw new Error('Missing Windows PC Required block message');
    if (iphoneText.includes('Secure Course Player')) throw new Error('Student portal HTML leaked to mobile device!');

    // 2. Android mobile attempt
    const androidRes = await fetch('http://localhost:3000/student/index.html', {
      headers: { 'User-Agent': 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Mobile Safari/537.36' }
    });
    if (androidRes.status !== 403) throw new Error(`Expected HTTP 403 for Android, got ${androidRes.status}`);

    // 3. Android "Desktop Site" Mode attempt (Emulating desktop UA with mobile platform hints)
    const androidDesktopRes = await fetch('http://localhost:3000/student', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Sec-CH-UA-Platform': '"Android"',
        'Sec-CH-UA-Mobile': '?0'
      }
    });
    if (androidDesktopRes.status !== 403) throw new Error(`Expected HTTP 403 for Android Desktop Site, got ${androidDesktopRes.status}`);

    // 4. Client Hints with Mobile Device Model (e.g. Pixel 8)
    const modelRes = await fetch('http://localhost:3000/student', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
        'Sec-CH-UA-Model': '"Pixel 8"'
      }
    });
    if (modelRes.status !== 403) throw new Error(`Expected HTTP 403 for Sec-CH-UA-Model, got ${modelRes.status}`);

    // 5. Mobile Client Hint Sec-CH-UA-Mobile: ?1
    const chRes = await fetch('http://localhost:3000/student', {
      headers: { 'Sec-CH-UA-Mobile': '?1' }
    });
    if (chRes.status !== 403) throw new Error(`Expected HTTP 403 for Sec-CH-UA-Mobile, got ${chRes.status}`);

    return 'iPhone, Android, Android Desktop Site, and Device-Model requests strictly blocked (HTTP 403)';
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

  // 9. Mobile User-Agent & Phone Desktop Site Rejection (403 Forbidden)
  await check('Mobile & Phone Desktop Site Block 403', async () => {
    // A. Standard Mobile UA
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
    if (res1.status !== 403) throw new Error(`Expected 403 for mobile UA, got ${res1.status}`);

    // B. Phone Desktop Site with spoofed desktop UA but mobile hardware telemetry (shortEdge < 600)
    const res2 = await fetch('http://localhost:3000/api/client/activate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      },
      body: JSON.stringify({
        courseId: activeCourseId,
        licenseKey: generatedKey,
        hwid: 'mobile-desktop-site-hwid',
        screenShortSide: 390,
        isPhoneDevice: true
      })
    });
    if (res2.status !== 403) throw new Error(`Expected 403 for Phone Desktop Site telemetry, got ${res2.status}`);

    return 'Mobile UA and Phone Desktop Site telemetry both strictly rejected (403 Forbidden)';
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

  // 14. Test License Cleanup (Delete mock test key so it does not pollute production DB)
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
    console.log('--- ALL 15 TESTS PASSED PERFECTLY ---');
    process.exit(0);
  } else {
    console.error(`--- ${failures} TESTS FAILED ---`);
    process.exit(1);
  }
}

runTests();

