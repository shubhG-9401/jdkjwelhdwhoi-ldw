/**
 * Secure Course Player - Main Application Coordinator
 * Modularized Architecture
 */

import { SecurityManager, isPhoneOverall } from './js/security.js';
import { parseEncryptedHeader, decryptCoursePackage } from './js/crypto.js';
import { studentApi } from './js/api.js';
import { studentStore } from './js/state.js';
import { VideoPlayerManager } from './js/player.js';
import { PdfViewerManager } from './js/pdfViewer.js';

document.addEventListener('DOMContentLoaded', async () => {
  // -------------------------------------------------------------
  // 1. INITIALIZE SECURITY MANAGERS & CLIENT HARDWARE ID
  // -------------------------------------------------------------
  const security = new SecurityManager({
    onTamper: (reason) => {
      const curState = studentStore.getState();
      studentApi.sendTamperAlert(curState.licenseKey, curState.hwid, reason);
    }
  });
  security.init();

  // If running on phone (including "Desktop site" mode), halt all client setup immediately
  if (security.checkMobileBlock()) {
    console.warn('[SECURITY] Course player setup halted: Mobile / Phone Desktop Site prohibited.');
    return;
  }

  const state = studentStore.getState();

  // Populate client device indicators
  const clientHwidDisplay = document.getElementById('client-hwid-display');
  const clientIpv4Display = document.getElementById('client-ipv4-display');
  const clientIpv6Display = document.getElementById('client-ipv6-display');

  if (clientHwidDisplay) clientHwidDisplay.textContent = state.hwid;
  if (clientIpv4Display) clientIpv4Display.textContent = state.clientIpv4;
  if (clientIpv6Display) clientIpv6Display.textContent = state.clientIpv6;

  studentApi.getMyIp().then(ips => {
    if (ips && ips.ipv4) {
      studentStore.setState({ clientIpv4: ips.ipv4, clientIpv6: ips.ipv6 || '::1' });
      if (clientIpv4Display) clientIpv4Display.textContent = ips.ipv4;
      if (clientIpv6Display) clientIpv6Display.textContent = ips.ipv6 || '::1';
    }
  }).catch(() => {});

  // -------------------------------------------------------------
  // 2. DOM ELEMENT REFERENCES
  // -------------------------------------------------------------
  const activationScreen = document.getElementById('activation-screen');
  const lmsScreen = document.getElementById('lms-screen');
  const encDropzone = document.getElementById('enc-dropzone');
  const encFileInput = document.getElementById('enc-file-input');
  const encFileLabel = document.getElementById('enc-file-label');
  const licenseInput = document.getElementById('license-input');
  const keyLengthCounter = document.getElementById('key-length-counter');
  const btnUnlockCourse = document.getElementById('btn-unlock-course');
  const activationError = document.getElementById('activation-error');
  const activationErrorMsg = document.getElementById('activation-error-msg');

  // LMS UI elements
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

  // Resource containers
  const docContainer = document.getElementById('doc-container');
  const docMarkdownTitle = document.getElementById('doc-markdown-title');
  const docMarkdownBody = document.getElementById('doc-markdown-body');

  // Initialize Player & PDF Managers
  const player = new VideoPlayerManager({
    videoContainer: document.getElementById('video-container'),
    playerVideo: document.getElementById('player-video'),
    videoLoadingSpinner: document.getElementById('video-loading-spinner'),
    videoBigPlayBtn: document.getElementById('video-big-play-btn'),
    videoErrorBanner: document.getElementById('video-error-banner'),
    videoErrorMsg: document.getElementById('video-error-msg'),
    videoStreamBadge: document.getElementById('video-stream-badge'),
    btnVideoPlay: document.getElementById('btn-video-play'),
    btnRetryVideo: document.getElementById('btn-retry-video'),
    videoTimeline: document.getElementById('video-seek'),
    videoTimeDisplay: document.getElementById('video-time'),
    btnVideoMute: document.getElementById('btn-video-mute'),
    videoVolume: document.getElementById('video-volume'),
    btnVideoFullscreen: document.getElementById('btn-video-fullscreen')
  });

  const pdfViewer = new PdfViewerManager({
    pdfContainer: document.getElementById('pdf-container'),
    pdfRenderCanvas: document.getElementById('pdf-render-canvas'),
    pdfWebFrame: document.getElementById('pdf-web-frame'),
    pdfPageNum: document.getElementById('pdf-page-num'),
    pdfPageCount: document.getElementById('pdf-page-count'),
    pdfZoomLevel: document.getElementById('pdf-zoom-level'),
    btnPdfPrev: document.getElementById('btn-pdf-prev'),
    btnPdfNext: document.getElementById('btn-pdf-next'),
    btnPdfZoomIn: document.getElementById('btn-pdf-zoom-in'),
    btnPdfZoomOut: document.getElementById('btn-pdf-zoom-out')
  });

  let activeLessonIndex = 0;
  let heartbeatInterval = null;
  let watermarkInterval = null;

  // Watermark Elements
  const floatingWatermark = document.getElementById('floating-watermark');
  const wmStudent = document.getElementById('wm-student');
  const wmIp = document.getElementById('wm-ip');
  const wmTime = document.getElementById('wm-time');

  function startDynamicWatermark(courseData) {
    if (wmStudent) wmStudent.textContent = courseData?.studentInfo?.name || 'Student';
    if (wmIp) wmIp.textContent = `${courseData?.studentInfo?.boundIpv4 || ''} ${courseData?.studentInfo?.boundIpv6 || ''}`.trim() || '127.0.0.1';

    function moveWatermark() {
      if (!floatingWatermark) return;
      if (wmTime) wmTime.textContent = new Date().toLocaleTimeString();
      const maxTop = Math.max(20, window.innerHeight - 80);
      const maxLeft = Math.max(20, window.innerWidth - 350);
      const top = Math.floor(Math.random() * maxTop);
      const left = Math.floor(Math.random() * maxLeft);
      floatingWatermark.style.top = `${top}px`;
      floatingWatermark.style.left = `${left}px`;
    }
    moveWatermark();
    if (watermarkInterval) clearInterval(watermarkInterval);
    watermarkInterval = setInterval(moveWatermark, 10000);
  }

  // -------------------------------------------------------------
  // 3. ENCRYPTED FILE SELECTION & DRAG-AND-DROP
  // -------------------------------------------------------------
  if (encDropzone && encFileInput) {
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
      if (e.dataTransfer.files?.length > 0) handleEncFile(e.dataTransfer.files[0]);
    });
    encFileInput.addEventListener('change', () => {
      if (encFileInput.files?.length > 0) handleEncFile(encFileInput.files[0]);
    });
  }

  async function handleEncFile(file) {
    try {
      const arrayBuffer = await file.arrayBuffer();
      const encryptedBuffer = new Uint8Array(arrayBuffer);
      const parsedMeta = parseEncryptedHeader(encryptedBuffer);

      studentStore.setState({ encryptedBuffer, parsedMeta });

      if (encFileLabel) {
        encFileLabel.innerHTML = `
          <span class="text-emerald-400 font-semibold">${file.name}</span>
          <div class="text-[10px] text-slate-400 font-mono mt-0.5">Valid AES-256 Package (${(file.size / (1024 * 1024)).toFixed(2)} MB)</div>
        `;
      }
      if (activationError) activationError.classList.add('hidden');
    } catch (err) {
      showActivationError(err.message);
      studentStore.setState({ encryptedBuffer: null, parsedMeta: null });
    }
  }

  // -------------------------------------------------------------
  // 4. LICENSE KEY INPUT & UNLOCK HANDLER
  // -------------------------------------------------------------
  if (licenseInput) {
    const savedKey = localStorage.getItem('drm_last_license_key');
    if (savedKey) {
      licenseInput.value = savedKey;
      if (keyLengthCounter) keyLengthCounter.textContent = `${savedKey.length} / 56`;
    }

    licenseInput.addEventListener('input', (e) => {
      let val = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
      if (val.length > 56) val = val.substring(0, 56);
      e.target.value = val;
      if (keyLengthCounter) {
        keyLengthCounter.textContent = `${val.length} / 56`;
        if (val.length === 56) keyLengthCounter.className = 'text-[11px] font-mono text-emerald-400 font-bold';
        else keyLengthCounter.className = 'text-[11px] font-mono text-slate-400';
      }
    });
  }

  if (btnUnlockCourse) {
    btnUnlockCourse.addEventListener('click', async () => {
      const curState = studentStore.getState();
      const key = (licenseInput?.value || '').trim().toUpperCase();

      if (!curState.encryptedBuffer) {
        showActivationError('Please select or auto-load an encrypted (.enc) course package first.');
        return;
      }

      if (key.length !== 56) {
        showActivationError(`License key must be exactly 56 characters long (Currently ${key.length}).`);
        return;
      }

      btnUnlockCourse.disabled = true;
      btnUnlockCourse.innerHTML = `
        <div class="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent mr-2 inline-block"></div>
        <span>Verifying 56-Char Key & Decrypting...</span>
      `;

      try {
        const activationData = await studentApi.activate({
          licenseKey: key,
          hwid: curState.hwid,
          keyId: curState.parsedMeta?.keyId,
          clientIpv4: curState.clientIpv4,
          clientIpv6: curState.clientIpv6,
          screenResolution: `${window.screen.width}x${window.screen.height}`,
          screenShortSide: Math.min(window.screen.width, window.screen.height),
          isPhoneDevice: isPhoneOverall().blocked
        });

        // Decrypt AES-256-GCM package into memory
        const decrypted = await decryptCoursePackage(
          curState.encryptedBuffer,
          activationData.decryptionKeyHex
        );

        localStorage.setItem('drm_last_license_key', key);

        const activeCourseData = {
          manifest: decrypted.manifest,
          files: decrypted.files,
          licenseKey: key,
          sessionToken: activationData.sessionToken,
          studentInfo: activationData.studentInfo,
          courseTitle: activationData.courseTitle
        };

        studentStore.setState({ activeCourseData, isUnlocked: true });

        launchLmsEnvironment(activeCourseData);
        startHeartbeat(key, curState.hwid, curState.clientIpv4, curState.clientIpv6);

      } catch (err) {
        console.error('Activation / Decryption error:', err);
        let errMsg = err.message;
        if (!errMsg || errMsg === 'OperationError' || errMsg.includes('decrypt')) {
          errMsg = 'Decryption failed: Course key mismatch. The selected .enc file does not match this license key.';
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
  }

  function showActivationError(msg) {
    if (activationErrorMsg) activationErrorMsg.textContent = msg;
    if (activationError) activationError.classList.remove('hidden');
  }

  // -------------------------------------------------------------
  // 5. LMS LAUNCH & CURRICULUM RENDERING
  // -------------------------------------------------------------
  function launchLmsEnvironment(courseData) {
    if (activationScreen) activationScreen.classList.add('hidden');
    if (lmsScreen) lmsScreen.classList.remove('hidden');

    if (lmsCourseTitle) lmsCourseTitle.textContent = courseData.courseTitle;
    if (lmsStudentName) lmsStudentName.textContent = courseData.studentInfo.name;
    if (lmsStudentIp) lmsStudentIp.textContent = `IPv4: ${courseData.studentInfo.boundIpv4 || '127.0.0.1'}`;

    startDynamicWatermark(courseData);
    renderCurriculum(courseData);

    const all = getAllLessons(courseData);
    const firstVideoIdx = all.findIndex(l => l.type === 'video');
    selectLesson(firstVideoIdx >= 0 ? firstVideoIdx : 0);
  }

  function getAllLessons(courseData) {
    const data = courseData || studentStore.getState().activeCourseData;
    const modules = data?.manifest?.modules || [];
    const list = [];
    modules.forEach((mod, modIdx) => {
      (mod.lessons || []).forEach((les, lesIdx) => {
        list.push({ ...les, moduleTitle: mod.moduleTitle, modIdx, lesIdx });
      });
    });
    return list;
  }

  function renderCurriculum(courseData) {
    const data = courseData || studentStore.getState().activeCourseData;
    if (!lmsCurriculumList || !data?.manifest?.modules) return;

    let flatCounter = 0;
    const completedSet = studentStore.getState().completedLessonIds;

    lmsCurriculumList.innerHTML = data.manifest.modules.map(mod => `
      <div class="border-b border-slate-800/80 last:border-b-0">
        <div class="px-5 py-3 bg-slate-950/40 text-[11px] font-semibold text-slate-400 uppercase tracking-wider flex items-center justify-between">
          <span>${mod.moduleTitle}</span>
          <span class="text-[10px] text-slate-500 font-mono">${(mod.lessons || []).length} items</span>
        </div>
        <div class="divide-y divide-slate-800/40">
          ${(mod.lessons || []).map(les => {
            const thisIdx = flatCounter++;
            const isActive = (thisIdx === activeLessonIndex);
            const isCompleted = completedSet.has(thisIdx);

            let iconName = 'file-text';
            if (les.type === 'video') iconName = 'play-circle';
            else if (les.type === 'pdf') iconName = 'file';
            else if (les.type === 'telegram') iconName = 'send';
            else if (les.type === 'image') iconName = 'image';

            return `
              <div onclick="window.selectLesson(${thisIdx})" class="px-5 py-3.5 flex items-center justify-between cursor-pointer transition-all ${
                isActive
                  ? 'bg-indigo-600/15 border-l-4 border-indigo-500 text-white font-medium'
                  : 'hover:bg-slate-800/40 text-slate-400'
              }">
                <div class="flex items-center space-x-3 overflow-hidden">
                  <i data-lucide="${iconName}" class="w-4 h-4 flex-shrink-0 ${isActive ? 'text-indigo-400' : 'text-slate-500'}"></i>
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

  function selectLesson(flatIdx) {
    const courseData = studentStore.getState().activeCourseData;
    const allLessons = getAllLessons(courseData);
    if (flatIdx < 0 || flatIdx >= allLessons.length) return;

    activeLessonIndex = flatIdx;
    const lesson = allLessons[flatIdx];

    if (activeLessonTitle) activeLessonTitle.textContent = lesson.title;
    if (activeLessonBadge) activeLessonBadge.textContent = (lesson.type || 'LESSON').toUpperCase();

    // Toggle complete button status
    const isCompleted = studentStore.isLessonCompleted(flatIdx);
    if (btnCompleteText) btnCompleteText.textContent = isCompleted ? 'Completed' : 'Mark Completed';
    if (btnToggleComplete) {
      if (isCompleted) btnToggleComplete.classList.add('bg-emerald-500/10', 'text-emerald-400', 'border-emerald-500/30');
      else btnToggleComplete.classList.remove('bg-emerald-500/10', 'text-emerald-400', 'border-emerald-500/30');
    }

    // Explicitly hide all viewing containers to prevent overlap
    const videoContainer = document.getElementById('video-container');
    const pdfContainer = document.getElementById('pdf-container');
    if (videoContainer) videoContainer.classList.add('hidden');
    if (pdfContainer) pdfContainer.classList.add('hidden');
    if (docContainer) docContainer.classList.add('hidden');

    // Clean up media players
    player.cleanup();
    pdfViewer.cleanup();

    if (lesson.type === 'video') {
      player.loadLesson(lesson, courseData);
    } else if (lesson.type === 'pdf') {
      pdfViewer.loadLesson(lesson, courseData);
    } else if (lesson.type === 'telegram') {
      loadExternalResource(lesson, 'telegram');
    } else if (lesson.type === 'image') {
      loadExternalResource(lesson, 'image');
    } else {
      loadDocumentLesson(lesson, courseData);
    }

    renderCurriculum(courseData);
  }

  window.selectLesson = selectLesson;

  if (btnToggleComplete) {
    btnToggleComplete.addEventListener('click', () => {
      const isCompleted = studentStore.isLessonCompleted(activeLessonIndex);
      studentStore.markLessonCompleted(activeLessonIndex, !isCompleted);
      renderCurriculum();
      selectLesson(activeLessonIndex);
    });
  }

  function updateProgress() {
    const allLessons = getAllLessons();
    if (allLessons.length === 0) return;
    const completedCount = studentStore.getState().completedLessonIds.size;
    const pct = Math.round((completedCount / allLessons.length) * 100);
    if (lmsProgressText) lmsProgressText.textContent = `${pct}%`;
    if (lmsProgressBar) lmsProgressBar.style.width = `${pct}%`;
  }

  function loadExternalResource(lesson, type) {
    if (docContainer) docContainer.classList.remove('hidden');
    if (docMarkdownTitle) docMarkdownTitle.textContent = lesson.title;
    if (docMarkdownBody) {
      if (type === 'telegram') {
        docMarkdownBody.innerHTML = `
          <div class="p-8 text-center space-y-4">
            <div class="w-16 h-16 mx-auto rounded-2xl bg-sky-500/20 text-sky-400 flex items-center justify-center">
              <i data-lucide="send" class="w-8 h-8"></i>
            </div>
            <h3 class="text-lg font-bold text-white">Join Telegram Channel</h3>
            <p class="text-sm text-slate-400 max-w-md mx-auto">This lesson links to an official course community or channel.</p>
            <a href="${lesson.url}" target="_blank" rel="noopener noreferrer" class="inline-flex items-center space-x-2 px-6 py-3 rounded-xl bg-sky-500 hover:bg-sky-400 text-white font-medium text-sm transition-all shadow-lg shadow-sky-500/25">
              <span>Open Telegram Group</span>
              <i data-lucide="external-link" class="w-4 h-4"></i>
            </a>
          </div>
        `;
      } else {
        let imgUrl = (lesson.url || '').trim();
        // Resolve ImgBB webpage share link to direct image URL
        if (imgUrl.includes('ibb.co/') && !imgUrl.includes('i.ibb.co/')) {
          if (imgUrl.includes('8LnvmC6P')) {
            imgUrl = 'https://i.ibb.co/Q37SJgrY/Screenshot-2026-10-13-231856.png';
          }
        }

        docMarkdownBody.innerHTML = `
          <div class="p-6 text-center space-y-4">
            <div class="inline-block relative max-w-4xl mx-auto rounded-2xl overflow-hidden border border-slate-800 bg-slate-900 shadow-2xl p-3">
              <img src="${imgUrl}" alt="${lesson.title}" 
                   class="max-h-[75vh] w-auto mx-auto rounded-xl shadow-lg object-contain block select-none pointer-events-none"
                   onerror="this.onerror=null; this.parentElement.innerHTML='<div class=\\'p-8 text-slate-400 text-xs\\'>Image could not be rendered directly.<br><a href=\\'${lesson.url}\\' target=\\'_blank\\' class=\\'text-indigo-400 underline mt-2 inline-block\\'>Click here to open image resource</a></div>';">
            </div>
            <div class="text-[11px] text-slate-500 font-mono">DRM Protected Educational Diagram</div>
          </div>
        `;
      }
      if (window.lucide) lucide.createIcons();
    }
  }

  async function loadDocumentLesson(lesson, courseData) {
    if (docContainer) docContainer.classList.remove('hidden');
    if (docMarkdownTitle) docMarkdownTitle.textContent = lesson.title;
    if (!docMarkdownBody) return;

    const blob = courseData?.files?.get(lesson.filename);
    if (blob) {
      const text = await blob.text();
      docMarkdownBody.textContent = text;
    } else if (lesson.url) {
      docMarkdownBody.innerHTML = `
        <div class="p-6 text-center space-y-3">
          <p class="text-sm text-slate-400">External document resource:</p>
          <a href="${lesson.url}" target="_blank" class="text-indigo-400 underline font-mono text-xs">${lesson.url}</a>
        </div>
      `;
    }
  }

  // -------------------------------------------------------------
  // 6. CONTINUITY HEARTBEAT & LOCK SESSION
  // -------------------------------------------------------------
  function startHeartbeat(licenseKey, hwid, ipv4, ipv6) {
    if (heartbeatInterval) clearInterval(heartbeatInterval);
    heartbeatInterval = setInterval(async () => {
      try {
        await studentApi.heartbeat({ licenseKey, hwid, clientIpv4: ipv4, clientIpv6: ipv6 });
      } catch (err) {
        clearInterval(heartbeatInterval);
        alert('Session terminated: ' + err.message);
        lockCourse();
      }
    }, 45000);
  }

  function lockCourse() {
    if (heartbeatInterval) clearInterval(heartbeatInterval);
    if (watermarkInterval) clearInterval(watermarkInterval);
    player.cleanup();
    pdfViewer.cleanup();
    studentStore.setState({ isUnlocked: false, activeCourseData: null });
    if (lmsScreen) lmsScreen.classList.add('hidden');
    if (activationScreen) activationScreen.classList.remove('hidden');
  }

  if (btnLockCourse) {
    btnLockCourse.addEventListener('click', () => {
      if (confirm('Lock course session and return to activation?')) {
        lockCourse();
      }
    });
  }

  if (window.lucide) lucide.createIcons();
});
