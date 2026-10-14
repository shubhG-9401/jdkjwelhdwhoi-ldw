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

  // 9. Mobile User-Agent Rejection (403 Forbidden)
  await check('Mobile Block 403', async () => {
    const res = await fetch('http://localhost:3000/api/client/activate', {
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
    if (res.status !== 403) throw new Error(`Expected 403, got ${res.status}`);
    return '403 Forbidden as expected';
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
        hwid: 'test-pc-hwid-998877'
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

  console.log('\n----------------------------------------');
  if (failures === 0) {
    console.log('--- ALL 12 TESTS PASSED PERFECTLY ---');
    process.exit(0);
  } else {
    console.error(`--- ${failures} TESTS FAILED ---`);
    process.exit(1);
  }
}

runTests();
