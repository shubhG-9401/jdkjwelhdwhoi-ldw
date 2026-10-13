// Student PC LMS Player Application Logic - High Reliability Video & PDF Engine
document.addEventListener('DOMContentLoaded', async () => {
  if (window.lucide) lucide.createIcons();

  // State
  let activeHwid = '';
  let activeIpv4 = '127.0.0.1';
  let activeIpv6 = '::1';
  let encryptedFileBuffer = null;
  let parsedMeta = null;
  let activeCourseData = null;
  let activeLessonIndex = 0;
  let completedLessons = new Set();
  let heartbeatTimer = null;
  let watermarkTimer = null;
  let hlsInstance = null; // Active HLS instance

  // PDF.js State
  let pdfDoc = null;
  let currentPdfPage = 1;
  let pdfZoom = 1.0;

  // DOM Elements - Activation Screen
  const activationScreen = document.getElementById('activation-screen');
  const lmsScreen = document.getElementById('lms-screen');
  const encDropzone = document.getElementById('enc-dropzone');
  const encFileInput = document.getElementById('enc-file-input');
  const encFileLabel = document.getElementById('enc-file-label');
  const licenseInput = document.getElementById('license-input');
  const keyLengthCounter = document.getElementById('key-length-counter');
  const clientHwidDisplay = document.getElementById('client-hwid-display');
  const clientIpv4Display = document.getElementById('client-ipv4-display');
  const clientIpv6Display = document.getElementById('client-ipv6-display');
  const btnUnlockCourse = document.getElementById('btn-unlock-course');
  const btnQuickLoadSigma = document.getElementById('btn-quick-load-sigma');
  const activationError = document.getElementById('activation-error');
  const activationErrorMsg = document.getElementById('activation-error-msg');

  // DOM Elements - LMS Header & General
  const lmsCourseTitle = document.getElementById('lms-course-title');
  const lmsStudentName = document.getElementById('lms-student-name');
  const lmsStudentIp = document.getElementById('lms-student-ip');
  const btnLockCourse = document.getElementById('btn-lock-course');
  const lmsCurriculumList = document.getElementById('lms-curriculum-list');
  const lmsProgressBar = document.getElementById('lms-progress-bar');
  const lmsProgressText = document.getElementById('lms-progress-text');
  const activeLessonBadge = document.getElementById('active-lesson-badge');
  const activeLessonTitle = document.getElementById('active-lesson-title');
  const btnToggleComplete = document.getElementById('btn-toggle-complete');
  const btnCompleteText = document.getElementById('btn-complete-text');

  // View Containers
  const videoContainer = document.getElementById('video-container');
  const pdfContainer = document.getElementById('pdf-container');
  const docContainer = document.getElementById('doc-container');
  const docContent = document.getElementById('doc-content');

  // Video Elements & Controls
  const playerVideo = document.getElementById('player-video');
  const videoBigPlayBtn = document.getElementById('video-big-play-btn');
  const videoLoadingSpinner = document.getElementById('video-loading-spinner');
  const videoErrorBanner = document.getElementById('video-error-banner');
  const videoErrorMsg = document.getElementById('video-error-msg');
  const btnRetryVideo = document.getElementById('btn-retry-video');
  const videoStreamBadge = document.getElementById('video-stream-badge');
  const btnVideoPlay = document.getElementById('btn-video-play');
  const btnVideoRewind = document.getElementById('btn-video-rewind');
  const btnVideoForward = document.getElementById('btn-video-forward');
  const btnVideoMute = document.getElementById('btn-video-mute');
  const videoVolume = document.getElementById('video-volume');
  const videoSeek = document.getElementById('video-seek');
  const videoTime = document.getElementById('video-time');
  const videoSpeed = document.getElementById('video-speed');
  const btnVideoFullscreen = document.getElementById('btn-video-fullscreen');

  // PDF Controls
  const btnPdfPrev = document.getElementById('btn-pdf-prev');
  const btnPdfNext = document.getElementById('btn-pdf-next');
  const pdfPageNum = document.getElementById('pdf-page-num');
  const pdfPageCount = document.getElementById('pdf-page-count');
  const btnPdfZoomIn = document.getElementById('btn-pdf-zoom-in');
  const btnPdfZoomOut = document.getElementById('btn-pdf-zoom-out');
  const pdfZoomLevel = document.getElementById('pdf-zoom-level');
  const btnPdfFitWidth = document.getElementById('btn-pdf-fit-width');
  const btnPdfOpenTab = document.getElementById('btn-pdf-open-tab');
  const pdfRenderCanvas = document.getElementById('pdf-render-canvas');
  const pdfWebFrame = document.getElementById('pdf-web-frame');

  // Watermark Elements
  const floatingWatermark = document.getElementById('floating-watermark');
  const wmStudent = document.getElementById('wm-student');
  const wmIp = document.getElementById('wm-ip');
  const wmTime = document.getElementById('wm-time');

  // -------------------------------------------------------------
  // 1. HARDWARE ID & DUAL IPv4 / IPv6 DETECTION
  // -------------------------------------------------------------
  async function initDeviceFingerprint() {
    if (window.desktopBridge && window.desktopBridge.getHwid) {
      activeHwid = await window.desktopBridge.getHwid();
    } else {
      let storedHwid = localStorage.getItem('__mock_hwid');
      if (!storedHwid) {
        storedHwid = 'PC-' + Math.random().toString(36).substring(2, 10).toUpperCase() + '-WIN64';
        localStorage.setItem('__mock_hwid', storedHwid);
      }
      activeHwid = storedHwid;
    }
    clientHwidDisplay.textContent = activeHwid;

    try {
      const res = await fetch('/api/health');
      if (res.ok) {
        activeIpv4 = window.location.hostname === 'localhost' ? '127.0.0.1' : window.location.hostname;
        activeIpv6 = '::1';
      }
    } catch (e) {
      activeIpv4 = '127.0.0.1';
      activeIpv6 = '::1';
    }

    clientIpv4Display.textContent = activeIpv4;
    clientIpv6Display.textContent = activeIpv6;
  }

  await initDeviceFingerprint();

  // 56-Character Key Counter
  licenseInput.addEventListener('input', () => {
    const len = licenseInput.value.trim().length;
    keyLengthCounter.textContent = `${len} / 56 chars`;
    if (len === 56) {
      keyLengthCounter.className = 'text-[10px] font-mono text-emerald-400 font-bold';
    } else {
      keyLengthCounter.className = 'text-[10px] font-mono text-slate-500';
    }
  });

  // -------------------------------------------------------------
  // 2. ENCRYPTED FILE SELECTION & HEADER INSPECTION
  // -------------------------------------------------------------
  encDropzone.addEventListener('click', () => encFileInput.click());

  encDropzone.addEventListener('dragover', (e) => {
    e.preventDefault();
    encDropzone.classList.add('border-indigo-500', 'bg-indigo-950/40');
  });

  encDropzone.addEventListener('dragleave', () => {
    encDropzone.classList.remove('border-indigo-500', 'bg-indigo-950/40');
  });

  encDropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    encDropzone.classList.remove('border-indigo-500', 'bg-indigo-950/40');
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleEncFile(e.dataTransfer.files[0]);
    }
  });

  encFileInput.addEventListener('change', () => {
    if (encFileInput.files && encFileInput.files.length > 0) {
      handleEncFile(encFileInput.files[0]);
    }
  });

  if (btnQuickLoadSigma) {
    btnQuickLoadSigma.addEventListener('click', async () => {
      btnQuickLoadSigma.disabled = true;
      btnQuickLoadSigma.innerHTML = `
        <div class="animate-spin rounded-full h-3 w-3 border-2 border-indigo-400 border-t-transparent"></div>
        <span>Auto-Loading Sigma 12...</span>
      `;
      try {
        const res = await fetch('/api/admin/courses/crs_sigma12/download');
        if (!res.ok) throw new Error('Could not fetch Sigma 12 course package from server.');
        const arrayBuf = await res.arrayBuffer();
        encryptedFileBuffer = new Uint8Array(arrayBuf);
        parsedMeta = parseEncryptedHeader(encryptedFileBuffer);

        encFileLabel.innerHTML = `
          <span class="text-emerald-400 font-semibold">sigma_12_encrypted.enc</span>
          <div class="text-[10px] text-slate-400 font-mono mt-0.5">Auto-Loaded AES-256 Package (${(encryptedFileBuffer.length / 1024).toFixed(1)} KB)</div>
        `;
        activationError.classList.add('hidden');
      } catch (err) {
        showActivationError('Auto-load failed: ' + (err.message || 'Network error'));
      } finally {
        btnQuickLoadSigma.disabled = false;
        btnQuickLoadSigma.innerHTML = `
          <i data-lucide="sparkles" class="w-3.5 h-3.5"></i>
          <span>Auto-Load Sigma 12 Package</span>
        `;
        if (window.lucide) lucide.createIcons();
      }
    });
  }

  async function handleEncFile(file) {
    try {
      const arrayBuffer = await file.arrayBuffer();
      encryptedFileBuffer = new Uint8Array(arrayBuffer);
      parsedMeta = parseEncryptedHeader(encryptedFileBuffer);

      encFileLabel.innerHTML = `
        <span class="text-emerald-400 font-semibold">${file.name}</span>
        <div class="text-[10px] text-slate-400 font-mono mt-0.5">Valid AES-256 Package (${(file.size / (1024 * 1024)).toFixed(2)} MB)</div>
      `;
      activationError.classList.add('hidden');
    } catch (err) {
      showActivationError(err.message);
      encryptedFileBuffer = null;
      parsedMeta = null;
    }
  }

  function parseEncryptedHeader(uint8Array) {
    const magic = new TextDecoder().decode(uint8Array.subarray(0, 10));
    if (magic !== 'SECUREDRM1') {
      throw new Error('Invalid file format. This is not a SecureDRM encrypted course file.');
    }

    const view = new DataView(uint8Array.buffer, uint8Array.byteOffset, uint8Array.byteLength);
    let offset = 10;
    const keyIdLen = view.getUint32(offset, false);
    offset += 4;

    const keyId = new TextDecoder().decode(uint8Array.subarray(offset, offset + keyIdLen));
    offset += keyIdLen;

    const iv = uint8Array.subarray(offset, offset + 12);
    offset += 12;

    const authTag = uint8Array.subarray(offset, offset + 16);
    offset += 16;

    const ciphertext = uint8Array.subarray(offset);

    return {
      keyId,
      iv,
      authTag,
      ciphertext,
      totalLength: uint8Array.length
    };
  }

  function showActivationError(msg) {
    const defaultMsg = 'Decryption failed: Course key mismatch or corrupted package. Please ensure the .enc file matches this license key.';
    activationErrorMsg.textContent = (msg && msg.trim()) ? msg : defaultMsg;
    activationError.classList.remove('hidden');
  }

  // -------------------------------------------------------------
  // 3. LICENSE VERIFICATION & IN-MEMORY DECRYPTION
  // -------------------------------------------------------------
  btnUnlockCourse.addEventListener('click', async () => {
    const licenseKey = licenseInput.value.trim().toUpperCase();

    if (!encryptedFileBuffer || !parsedMeta) {
      showActivationError('Please select an encrypted (.enc) course package first.');
      return;
    }

    if (!licenseKey) {
      showActivationError('Please enter your 56-character Student License Key.');
      return;
    }

    if (licenseKey.length !== 56) {
      showActivationError(`License key must be exactly 56 characters long (Currently ${licenseKey.length}).`);
      return;
    }

    activationError.classList.add('hidden');
    btnUnlockCourse.disabled = true;
    btnUnlockCourse.innerHTML = `
      <div class="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
      <span>Verifying 56-Char Key with Server...</span>
    `;

    try {
      const response = await fetch('/api/client/activate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          licenseKey,
          hwid: activeHwid,
          keyId: parsedMeta.keyId,
          clientIpv4: activeIpv4,
          clientIpv6: activeIpv6
        })
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Activation denied by server.');
      }

      btnUnlockCourse.innerHTML = `
        <div class="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
        <span>Decrypting Course in RAM...</span>
      `;

      let decryptedManifest = null;
      let decryptedFilesMap = new Map();

      if (window.desktopBridge && window.desktopBridge.decryptBundle) {
        const decryptRes = await window.desktopBridge.decryptBundle({
          bufferArray: Array.from(encryptedFileBuffer),
          keyHex: data.decryptionKeyHex
        });

        if (!decryptRes.success) throw new Error('Decryption failed: ' + decryptRes.error);

        decryptedManifest = decryptRes.manifest;
        for (const [fname, fbuf] of Object.entries(decryptRes.files)) {
          const blob = new Blob([new Uint8Array(fbuf.data || fbuf)]);
          decryptedFilesMap.set(fname, blob);
        }
      } else {
        const { manifest, files } = await decryptWithWebCrypto(
          parsedMeta,
          data.decryptionKeyHex
        );
        decryptedManifest = manifest;
        decryptedFilesMap = files;
      }

      activeCourseData = {
        manifest: decryptedManifest,
        files: decryptedFilesMap,
        licenseKey,
        sessionToken: data.sessionToken,
        studentInfo: data.studentInfo,
        courseTitle: data.courseTitle
      };

      launchLmsEnvironment();
      startHeartbeat(licenseKey);

    } catch (err) {
      console.error('Activation / Decryption error:', err);
      let errMsg = err.message;
      if (!errMsg || errMsg === 'OperationError' || errMsg.includes('decrypt')) {
        errMsg = 'Decryption failed: Course key mismatch. The selected .enc file does not match this license key, or was encrypted with a different key.';
      }
      showActivationError(errMsg);
    } finally {
      btnUnlockCourse.disabled = false;
      btnUnlockCourse.innerHTML = `
        <i data-lucide="unlock" class="w-4 h-4"></i>
        <span>Verify 56-Char Key & Decrypt Course</span>
      `;
      if (window.lucide) lucide.createIcons();
    }
  });

  async function decryptWithWebCrypto(meta, keyHex) {
    const rawKey = new Uint8Array(keyHex.match(/.{1,2}/g).map(byte => parseInt(byte, 16)));
    const cryptoKey = await window.crypto.subtle.importKey(
      'raw',
      rawKey,
      { name: 'AES-GCM' },
      false,
      ['decrypt']
    );

    const combinedCiphertext = new Uint8Array(meta.ciphertext.length + meta.authTag.length);
    combinedCiphertext.set(meta.ciphertext, 0);
    combinedCiphertext.set(meta.authTag, meta.ciphertext.length);

    const decryptedArrayBuffer = await window.crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: meta.iv },
      cryptoKey,
      combinedCiphertext
    );

    const zip = await JSZip.loadAsync(decryptedArrayBuffer);
    const manifestFile = zip.file('manifest.json');
    if (!manifestFile) throw new Error('manifest.json missing inside course bundle.');

    const manifestText = await manifestFile.async('text');
    const manifest = JSON.parse(manifestText);

    const files = new Map();
    const assetFiles = zip.folder('assets');
    if (assetFiles) {
      const promises = [];
      assetFiles.forEach((relativePath, file) => {
        if (!file.dir) {
          promises.push((async () => {
            const blob = await file.async('blob');
            files.set(relativePath, blob);
          })());
        }
      });
      await Promise.all(promises);
    }

    return { manifest, files };
  }

  // -------------------------------------------------------------
  // 4. LMS PLATFORM LAUNCH & CURRICULUM RENDER
  // -------------------------------------------------------------
  function launchLmsEnvironment() {
    activationScreen.classList.add('hidden');
    lmsScreen.classList.remove('hidden');

    lmsCourseTitle.textContent = activeCourseData.courseTitle;
    lmsStudentName.textContent = activeCourseData.studentInfo.name;
    lmsStudentIp.textContent = `IPv4: ${activeCourseData.studentInfo.boundIpv4 || '127.0.0.1'}`;

    wmStudent.textContent = activeCourseData.studentInfo.name;
    wmIp.textContent = `${activeCourseData.studentInfo.boundIpv4 || ''} ${activeCourseData.studentInfo.boundIpv6 || ''}`.trim();
    startDynamicWatermark();

    renderCurriculum();

    // Default: select the first lesson that is a VIDEO (e.g. Live sessions or welcome)
    const all = getAllLessons();
    const firstVideoIdx = all.findIndex(l => l.type === 'video');
    selectLesson(firstVideoIdx >= 0 ? firstVideoIdx : 0);
  }

  function getAllLessons() {
    if (!activeCourseData || !activeCourseData.manifest) return [];
    const list = [];
    (activeCourseData.manifest.modules || []).forEach((mod, modIdx) => {
      (mod.lessons || []).forEach((les, lesIdx) => {
        list.push({
          ...les,
          moduleTitle: mod.moduleTitle || `Module ${modIdx + 1}`,
          flatIndex: list.length
        });
      });
    });
    return list;
  }

  function renderCurriculum() {
    const modules = activeCourseData.manifest.modules || [];
    let lessonIndexCounter = 0;

    lmsCurriculumList.innerHTML = modules.map((mod, modIdx) => `
      <div class="rounded-xl border border-slate-800 bg-slate-950/60 overflow-hidden">
        <div class="p-3 bg-slate-900/60 text-xs font-semibold text-slate-300 border-b border-slate-800/80 flex items-center justify-between">
          <span>${mod.moduleTitle || `Module ${modIdx + 1}`}</span>
          <span class="text-[10px] text-slate-500 font-mono">${mod.lessons ? mod.lessons.length : 0} items</span>
        </div>
        <div class="divide-y divide-slate-800/40">
          ${(mod.lessons || []).map(les => {
            const thisIdx = lessonIndexCounter++;
            const isCompleted = completedLessons.has(thisIdx);
            
            let iconName = 'play-circle';
            if (les.type === 'pdf') iconName = 'file-text';
            else if (les.type === 'telegram') iconName = 'send';
            else if (les.type === 'image') iconName = 'image';
            else if (les.type === 'doc') iconName = 'file-code';

            return `
              <div class="lesson-item p-2.5 flex items-center justify-between cursor-pointer hover:bg-slate-800/40 transition-colors ${thisIdx === activeLessonIndex ? 'active' : ''}" 
                onclick="window.selectLesson(${thisIdx})">
                <div class="flex items-center space-x-2.5 overflow-hidden">
                  <i data-lucide="${iconName}" class="w-4 h-4 text-indigo-400 flex-shrink-0"></i>
                  <span class="lesson-title text-xs text-slate-300 truncate max-w-[200px]">${les.title}</span>
                </div>
                <div class="flex-shrink-0">
                  <i data-lucide="${isCompleted ? 'check-circle-2' : 'circle'}" class="w-3.5 h-3.5 ${isCompleted ? 'text-emerald-400' : 'text-slate-600'}"></i>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `).join('');

    updateProgress();
    if (window.lucide) lucide.createIcons();
  }

  window.selectLesson = function(flatIdx) {
    const allLessons = getAllLessons();
    if (flatIdx < 0 || flatIdx >= allLessons.length) return;

    activeLessonIndex = flatIdx;
    const lesson = allLessons[flatIdx];

    activeLessonTitle.textContent = lesson.title;
    activeLessonBadge.textContent = lesson.type.toUpperCase();

    // Toggle complete button status
    if (completedLessons.has(flatIdx)) {
      btnCompleteText.textContent = 'Completed';
      btnToggleComplete.classList.add('bg-emerald-500/10', 'text-emerald-400', 'border-emerald-500/30');
    } else {
      btnCompleteText.textContent = 'Mark Completed';
      btnToggleComplete.classList.remove('bg-emerald-500/10', 'text-emerald-400', 'border-emerald-500/30');
    }

    // CRITICAL: Clean up and unload previous iframe immediately so it cannot hijack beforeunload
    pdfWebFrame.src = 'about:blank';
    pdfWebFrame.classList.add('hidden');
    pdfRenderCanvas.classList.remove('hidden');

    // Hide all view containers
    videoContainer.classList.add('hidden');
    pdfContainer.classList.add('hidden');
    docContainer.classList.add('hidden');

    // Clean up active video & HLS
    playerVideo.pause();
    if (hlsInstance) {
      hlsInstance.destroy();
      hlsInstance = null;
    }

    // Hide error / loading banners
    videoErrorBanner.classList.add('hidden');
    videoLoadingSpinner.classList.add('hidden');

    if (lesson.type === 'video') {
      loadVideoLesson(lesson);
    } else if (lesson.type === 'pdf') {
      loadPdfLesson(lesson);
    } else if (lesson.type === 'telegram') {
      loadTelegramResource(lesson);
    } else if (lesson.type === 'image') {
      loadImageResource(lesson);
    } else {
      loadDocumentLesson(lesson);
    }

    renderCurriculum();
  };

  btnToggleComplete.addEventListener('click', () => {
    if (completedLessons.has(activeLessonIndex)) {
      completedLessons.delete(activeLessonIndex);
    } else {
      completedLessons.add(activeLessonIndex);
    }
    renderCurriculum();
    window.selectLesson(activeLessonIndex);
  });

  function updateProgress() {
    const allLessons = getAllLessons();
    if (allLessons.length === 0) return;
    const pct = Math.round((completedLessons.size / allLessons.length) * 100);
    lmsProgressText.textContent = `${pct}%`;
    lmsProgressBar.style.width = `${pct}%`;
  }

  // -------------------------------------------------------------
  // 5. HIGH-RELIABILITY VIDEO PLAYER (HLS .m3u8 & Local MP4)
  // -------------------------------------------------------------
  let currentActiveLessonForRetry = null;

  function loadVideoLesson(lesson) {
    currentActiveLessonForRetry = lesson;
    videoContainer.classList.remove('hidden');
    videoLoadingSpinner.classList.remove('hidden');
    videoBigPlayBtn.classList.remove('hidden');

    const streamUrl = lesson.url || '';
    let streamSource = streamUrl;
    // Mask stream through DRM Proxy so original Wistia Cloudfront URL is hidden from Network tab
    if (activeCourseData && activeCourseData.sessionToken && streamUrl) {
      const b64 = btoa(streamUrl);
      streamSource = `/api/drm/stream/playlist.m3u8?token=${activeCourseData.sessionToken}&url=${encodeURIComponent(b64)}`;
    }

    if (streamUrl && (streamUrl.includes('.m3u8') || streamUrl.includes('wistia') || lesson.isStreamUrl)) {
      // HLS .m3u8 Stream
      videoStreamBadge.textContent = 'DRM SECURE STREAM';

      // Check if HLS.js is loaded
      if (window.Hls && Hls.isSupported()) {
        hlsInstance = new Hls({
          enableWorker: true,
          lowLatencyMode: true,
          maxBufferLength: 30,
          maxMaxBufferLength: 60
        });

        hlsInstance.loadSource(streamSource);
        hlsInstance.attachMedia(playerVideo);

        hlsInstance.on(Hls.Events.MANIFEST_PARSED, () => {
          videoLoadingSpinner.classList.add('hidden');
          // Try to play or keep Big Play Button ready
          playerVideo.play().then(() => {
            videoBigPlayBtn.classList.add('hidden');
            btnVideoPlay.innerHTML = `<i data-lucide="pause" class="w-5 h-5"></i>`;
            if (window.lucide) lucide.createIcons();
          }).catch(err => {
            // Autoplay prevented by browser: User can click Big Play Button
            videoBigPlayBtn.classList.remove('hidden');
            console.log('Autoplay deferred, awaiting user click:', err.message);
          });
        });

        hlsInstance.on(Hls.Events.ERROR, (event, data) => {
          console.warn('HLS Event Error:', data);
          if (data.fatal) {
            switch (data.type) {
              case Hls.ErrorTypes.NETWORK_ERROR:
                console.log('Recovering from network error...');
                hlsInstance.startLoad();
                break;
              case Hls.ErrorTypes.MEDIA_ERROR:
                console.log('Recovering from media error...');
                hlsInstance.recoverMediaError();
                break;
              default:
                videoLoadingSpinner.classList.add('hidden');
                videoErrorMsg.textContent = `Stream Error: ${data.details || 'Cannot load video segment'}`;
                videoErrorBanner.classList.remove('hidden');
                hlsInstance.destroy();
                break;
            }
          }
        });

      } else if (playerVideo.canPlayType('application/vnd.apple.mpegurl')) {
        // Native Safari/iOS support
        playerVideo.src = streamUrl;
        playerVideo.addEventListener('loadedmetadata', () => {
          videoLoadingSpinner.classList.add('hidden');
        });
      } else {
        videoLoadingSpinner.classList.add('hidden');
        videoErrorMsg.textContent = 'HLS.js player engine could not be initialized.';
        videoErrorBanner.classList.remove('hidden');
      }

    } else {
      // Local In-Memory Encrypted MP4 File
      videoStreamBadge.textContent = 'LOCAL MP4';
      const blob = activeCourseData.files.get(lesson.filename);
      if (blob) {
        playerVideo.src = URL.createObjectURL(blob);
        playerVideo.load();
        videoLoadingSpinner.classList.add('hidden');
      } else if (streamUrl) {
        playerVideo.src = streamUrl;
        playerVideo.load();
        videoLoadingSpinner.classList.add('hidden');
      }
    }
  }

  // Big Play Button Overlay Click
  videoBigPlayBtn.addEventListener('click', () => {
    playerVideo.play().then(() => {
      videoBigPlayBtn.classList.add('hidden');
      btnVideoPlay.innerHTML = `<i data-lucide="pause" class="w-5 h-5"></i>`;
      if (window.lucide) lucide.createIcons();
    }).catch(err => {
      alert('Could not start playback: ' + err.message);
    });
  });

  // Retry Button Click
  btnRetryVideo.addEventListener('click', () => {
    videoErrorBanner.classList.add('hidden');
    if (currentActiveLessonForRetry) {
      loadVideoLesson(currentActiveLessonForRetry);
    }
  });

  // Toggle Play / Pause
  btnVideoPlay.addEventListener('click', toggleVideoPlay);
  playerVideo.addEventListener('click', toggleVideoPlay);

  function toggleVideoPlay() {
    if (playerVideo.paused) {
      playerVideo.play().then(() => {
        videoBigPlayBtn.classList.add('hidden');
        btnVideoPlay.innerHTML = `<i data-lucide="pause" class="w-5 h-5"></i>`;
      }).catch(e => console.log(e));
    } else {
      playerVideo.pause();
      videoBigPlayBtn.classList.remove('hidden');
      btnVideoPlay.innerHTML = `<i data-lucide="play" class="w-5 h-5"></i>`;
    }
    if (window.lucide) lucide.createIcons();
  }

  playerVideo.addEventListener('play', () => {
    videoBigPlayBtn.classList.add('hidden');
    videoLoadingSpinner.classList.add('hidden');
    btnVideoPlay.innerHTML = `<i data-lucide="pause" class="w-5 h-5"></i>`;
    if (window.lucide) lucide.createIcons();
  });

  playerVideo.addEventListener('pause', () => {
    videoBigPlayBtn.classList.remove('hidden');
    btnVideoPlay.innerHTML = `<i data-lucide="play" class="w-5 h-5"></i>`;
    if (window.lucide) lucide.createIcons();
  });

  playerVideo.addEventListener('waiting', () => {
    videoLoadingSpinner.classList.remove('hidden');
  });

  playerVideo.addEventListener('playing', () => {
    videoLoadingSpinner.classList.add('hidden');
  });

  playerVideo.addEventListener('timeupdate', () => {
    if (!playerVideo.duration) return;
    const progress = (playerVideo.currentTime / playerVideo.duration) * 100;
    videoSeek.value = progress;

    const cur = formatTime(playerVideo.currentTime);
    const dur = formatTime(playerVideo.duration);
    videoTime.textContent = `${cur} / ${dur}`;
  });

  videoSeek.addEventListener('input', () => {
    if (!playerVideo.duration) return;
    playerVideo.currentTime = (videoSeek.value / 100) * playerVideo.duration;
  });

  btnVideoRewind.addEventListener('click', () => {
    playerVideo.currentTime = Math.max(0, playerVideo.currentTime - 10);
  });

  btnVideoForward.addEventListener('click', () => {
    playerVideo.currentTime = Math.min(playerVideo.duration || 9999, playerVideo.currentTime + 10);
  });

  videoSpeed.addEventListener('change', (e) => {
    playerVideo.playbackRate = parseFloat(e.target.value);
  });

  videoVolume.addEventListener('input', (e) => {
    playerVideo.volume = parseFloat(e.target.value);
  });

  btnVideoMute.addEventListener('click', () => {
    playerVideo.muted = !playerVideo.muted;
    btnVideoMute.innerHTML = `<i data-lucide="${playerVideo.muted ? 'volume-x' : 'volume-2'}" class="w-4 h-4"></i>`;
    if (window.lucide) lucide.createIcons();
  });

  btnVideoFullscreen.addEventListener('click', () => {
    if (!document.fullscreenElement) {
      videoContainer.requestFullscreen().catch(err => alert(err.message));
    } else {
      document.exitFullscreen();
    }
  });

  function formatTime(seconds) {
    if (isNaN(seconds)) return '00:00';
    const min = Math.floor(seconds / 60);
    const sec = Math.floor(seconds % 60);
    return `${min.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
  }

  // -------------------------------------------------------------
  // 6. PDF VIEWER LOGIC (PDF.js Canvas & Isolated Web PDFs)
  // -------------------------------------------------------------
  async function loadPdfLesson(lesson) {
    pdfContainer.classList.remove('hidden');

    const blob = activeCourseData.files.get(lesson.filename);

    if (blob) {
      // In-memory decrypted PDF file
      btnPdfOpenTab.classList.add('hidden');
      pdfWebFrame.classList.add('hidden');
      pdfRenderCanvas.classList.remove('hidden');

      try {
        const arrayBuffer = await blob.arrayBuffer();
        const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
        pdfDoc = await loadingTask.promise;
        pdfPageCount.textContent = pdfDoc.numPages;
        currentPdfPage = 1;
        renderPdfPage(currentPdfPage);
      } catch (err) {
        console.error('PDF error:', err);
      }
    } else if (lesson.url) {
      btnPdfOpenTab.href = lesson.url;
      btnPdfOpenTab.classList.remove('hidden');

      if (lesson.url.endsWith('.pdf')) {
        pdfWebFrame.classList.add('hidden');
        pdfRenderCanvas.classList.remove('hidden');
        try {
          const loadingTask = pdfjsLib.getDocument(lesson.url);
          pdfDoc = await loadingTask.promise;
          pdfPageCount.textContent = pdfDoc.numPages;
          currentPdfPage = 1;
          renderPdfPage(currentPdfPage);
        } catch (e) {
          pdfRenderCanvas.classList.add('hidden');
          pdfWebFrame.classList.remove('hidden');
          pdfWebFrame.src = lesson.url;
        }
      } else {
        // Third-party PDF portal (e.g. pdffiller)
        pdfRenderCanvas.classList.add('hidden');
        pdfWebFrame.classList.remove('hidden');
        // Sandboxed so it cannot hijack beforeunload
        pdfWebFrame.src = lesson.url;
      }
    }
  }

  async function renderPdfPage(num) {
    if (!pdfDoc) return;
    const page = await pdfDoc.getPage(num);
    const viewport = page.getViewport({ scale: pdfZoom });

    pdfRenderCanvas.height = viewport.height;
    pdfRenderCanvas.width = viewport.width;

    const renderContext = {
      canvasContext: pdfRenderCanvas.getContext('2d'),
      viewport
    };

    await page.render(renderContext).promise;
    pdfPageNum.textContent = num;
    pdfZoomLevel.textContent = `${Math.round(pdfZoom * 100)}%`;
  }

  btnPdfPrev.addEventListener('click', () => {
    if (currentPdfPage <= 1) return;
    currentPdfPage--;
    renderPdfPage(currentPdfPage);
  });

  btnPdfNext.addEventListener('click', () => {
    if (!pdfDoc || currentPdfPage >= pdfDoc.numPages) return;
    currentPdfPage++;
    renderPdfPage(currentPdfPage);
  });

  btnPdfZoomIn.addEventListener('click', () => {
    pdfZoom = Math.min(2.5, pdfZoom + 0.25);
    renderPdfPage(currentPdfPage);
  });

  btnPdfZoomOut.addEventListener('click', () => {
    pdfZoom = Math.max(0.5, pdfZoom - 0.25);
    renderPdfPage(currentPdfPage);
  });

  btnPdfFitWidth.addEventListener('click', () => {
    pdfZoom = 1.25;
    renderPdfPage(currentPdfPage);
  });

  // -------------------------------------------------------------
  // 7. TELEGRAM, IMAGE & DOCUMENT LESSON VIEWER
  // -------------------------------------------------------------
  function loadTelegramResource(lesson) {
    docContainer.classList.remove('hidden');
    docContent.innerHTML = `
      <div class="max-w-xl mx-auto p-8 rounded-2xl bg-slate-900 border border-slate-800 text-center space-y-4 shadow-2xl">
        <div class="w-16 h-16 mx-auto rounded-full bg-sky-500/20 text-sky-400 flex items-center justify-center">
          <i data-lucide="send" class="w-8 h-8"></i>
        </div>
        <h2 class="text-xl font-bold text-white">${lesson.title}</h2>
        <p class="text-slate-300 text-xs">Official Telegram Community / Resource Channel for this Course.</p>
        <div class="pt-2">
          <a href="${lesson.url}" target="_blank" class="inline-flex items-center space-x-2 px-6 py-3 rounded-xl bg-sky-500 hover:bg-sky-400 text-white font-medium text-xs shadow-lg shadow-sky-500/25 transition-all">
            <span>Join Telegram Channel</span>
            <i data-lucide="external-link" class="w-4 h-4"></i>
          </a>
        </div>
        <div class="text-[10px] text-slate-500 font-mono">${lesson.url}</div>
      </div>
    `;
    if (window.lucide) lucide.createIcons();
  }

  function loadImageResource(lesson) {
    docContainer.classList.remove('hidden');
    docContent.innerHTML = `
      <div class="max-w-2xl mx-auto p-6 rounded-2xl bg-slate-900 border border-slate-800 text-center space-y-4">
        <h2 class="text-lg font-bold text-white">${lesson.title}</h2>
        <img src="${lesson.url}" alt="${lesson.title}" class="rounded-xl max-w-full mx-auto shadow-2xl border border-slate-800">
        <div class="text-[10px] text-slate-500 font-mono">${lesson.url}</div>
      </div>
    `;
  }

  async function loadDocumentLesson(lesson) {
    docContainer.classList.remove('hidden');
    const blob = activeCourseData.files.get(lesson.filename);

    let text = lesson.content || '';
    if (blob) {
      text = await blob.text();
    }

    docContent.innerHTML = `<h1 class="text-2xl font-bold text-white mb-4">${lesson.title}</h1><p class="my-3 text-slate-300 leading-relaxed">${text}</p>`;
  }

  // -------------------------------------------------------------
  // 8. DYNAMIC ANTI-PIRACY WATERMARK ENGINE
  // -------------------------------------------------------------
  function startDynamicWatermark() {
    function updateWatermarkPosition() {
      wmTime.textContent = new Date().toLocaleTimeString();
      const maxTop = window.innerHeight - 100;
      const maxLeft = window.innerWidth - 320;
      const randomTop = Math.floor(Math.random() * Math.max(20, maxTop));
      const randomLeft = Math.floor(Math.random() * Math.max(20, maxLeft));

      floatingWatermark.style.top = `${randomTop}px`;
      floatingWatermark.style.left = `${randomLeft}px`;
    }

    updateWatermarkPosition();
    if (watermarkTimer) clearInterval(watermarkTimer);
    watermarkTimer = setInterval(updateWatermarkPosition, 12000);

    setInterval(() => {
      wmTime.textContent = new Date().toLocaleTimeString();
    }, 1000);
  }

  // -------------------------------------------------------------
  // 9. CONTINUOUS DRM SESSION HEARTBEAT
  // -------------------------------------------------------------
  function startHeartbeat(licenseKey) {
    if (heartbeatTimer) clearInterval(heartbeatTimer);

    heartbeatTimer = setInterval(async () => {
      try {
        const res = await fetch('/api/client/heartbeat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            licenseKey,
            hwid: activeHwid,
            clientIpv4: activeIpv4,
            clientIpv6: activeIpv6
          })
        });

        const data = await res.json();
        if (!res.ok || !data.valid) {
          terminateSession(data.reason || 'Session invalidated by security monitor.');
        }
      } catch (err) {
        console.warn('Heartbeat check warning:', err.message);
      }
    }, 25000);
  }

  function terminateSession(reason) {
    if (heartbeatTimer) clearInterval(heartbeatTimer);
    if (watermarkTimer) clearInterval(watermarkTimer);
    if (hlsInstance) {
      hlsInstance.destroy();
      hlsInstance = null;
    }

    if (activeCourseData && activeCourseData.files) {
      activeCourseData.files.clear();
    }
    activeCourseData = null;
    playerVideo.src = '';

    lmsScreen.classList.add('hidden');
    activationScreen.classList.remove('hidden');
    showActivationError(`Access Terminated: ${reason}`);
    alert(`Course Access Blocked: ${reason}`);
  }

  btnLockCourse.addEventListener('click', () => {
    if (confirm('Lock and close this course?')) {
      terminateSession('Course closed by user.');
    }
  });

  // -------------------------------------------------------------
  // 10. ANTI-TAMPERING & DEVTOOLS / NETWORK INSPECTION TRAP
  // -------------------------------------------------------------
  const tamperLockdownScreen = document.getElementById('tamper-lockdown-screen');
  let isTamperTriggered = false;

  function triggerSecurityLockdown(reason) {
    if (isTamperTriggered) return;
    isTamperTriggered = true;

    // Immediately kill video player and wipe src
    if (playerVideo) {
      playerVideo.pause();
      playerVideo.removeAttribute('src');
      playerVideo.load();
    }
    if (hlsInstance) {
      hlsInstance.destroy();
      hlsInstance = null;
    }

    // Purge memory blobs
    if (activeCourseData && activeCourseData.files) {
      activeCourseData.files.clear();
    }

    // Display lockdown shield
    if (tamperLockdownScreen) {
      tamperLockdownScreen.classList.remove('hidden');
      if (window.lucide) lucide.createIcons();
    }

    // Log tampering attempt to server
    fetch('/api/client/tamper-alert', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        licenseKey: activeCourseData ? activeCourseData.licenseKey : 'ANONYMOUS',
        hwid: activeHwid,
        reason
      })
    }).catch(() => {});
  }

  // 1. DevTools Inspector Traps (Active during playback)
  const devtoolsTrap = new Image();
  Object.defineProperty(devtoolsTrap, 'id', {
    get: function() {
      if (activeCourseData && !isTamperTriggered) {
        triggerSecurityLockdown('Developer Tools / Network Inspector dock detected.');
      }
    }
  });

  setInterval(() => {
    if (isTamperTriggered || !activeCourseData) return;
    
    // Console evaluation detector
    console.log('%c', devtoolsTrap);
    console.clear();

    // Viewport Delta Trap: DevTools dock takes >= 280px width or >= 320px height
    const widthDiff = window.outerWidth - window.innerWidth;
    const heightDiff = window.outerHeight - window.innerHeight;
    if (widthDiff > 280 || heightDiff > 320) {
      triggerSecurityLockdown('Developer Tools / Network Inspector dock detected.');
    }
  }, 2000);

  // 2. Keyboard Lockdown: Block F12, Ctrl+Shift+I, Ctrl+Shift+J, Ctrl+U, etc.
  document.addEventListener('contextmenu', (e) => e.preventDefault());

  document.addEventListener('keydown', (e) => {
    const key = e.key.toLowerCase();
    if (
      key === 'f12' ||
      (e.ctrlKey && e.shiftKey && (key === 'i' || key === 'j' || key === 'c')) ||
      (e.ctrlKey && (key === 'u' || key === 's' || key === 'p' || key === 'r'))
    ) {
      e.preventDefault();
      triggerSecurityLockdown('Inspect shortcut or Developer Tools hotkey pressed.');
      return false;
    }
  });

});
