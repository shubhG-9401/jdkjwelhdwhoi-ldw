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
import { StudentToast } from './js/toast.js';

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
  if (clientIpv6Display) clientIpv6Display.textContent = state.clientIpv6 || 'Detecting...';

  studentApi.getMyIp().then(ips => {
    if (ips && ips.ipv4) {
      studentStore.setState({ clientIpv4: ips.ipv4, clientIpv6: ips.ipv6 || null });
      if (clientIpv4Display) clientIpv4Display.textContent = ips.ipv4;
      if (clientIpv6Display) {
        if (ips.ipv6 && ips.ipv6 !== '::1') {
          clientIpv6Display.textContent = ips.ipv6;
          clientIpv6Display.className = 'font-mono text-indigo-400 font-semibold select-all text-[10px]';
        } else if (ips.ipv6 === '::1') {
          clientIpv6Display.textContent = '::1 (Localhost)';
          clientIpv6Display.className = 'font-mono text-slate-400 text-[10px]';
        } else {
          clientIpv6Display.textContent = 'IPv4 Connection';
          clientIpv6Display.className = 'italic text-slate-500 text-[10px]';
        }
      }
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

  // Apna College LMS navigation elements
  const btnCollapseSidebar = document.getElementById('btn-collapse-sidebar');
  const btnExpandSidebar = document.getElementById('btn-expand-sidebar');
  const lmsSidebar = document.getElementById('lms-sidebar');
  const btnBackCourse = document.getElementById('btn-back-course');
  const btnPrevLesson = document.getElementById('btn-prev-lesson');
  const btnNextLesson = document.getElementById('btn-next-lesson');
  const wmApnaEmail = document.getElementById('wm-apna-email');

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
    btnVideoFullscreen: document.getElementById('btn-video-fullscreen'),
    onThresholdComplete: (lesson, cur, dur) => {
      handleAutoLessonCompletion(lesson);
    }
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
          <div class="flex items-center justify-center space-x-2 text-emerald-400 font-semibold">
            <svg class="w-4 h-4 text-emerald-400 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>
            <span class="truncate max-w-[280px]">${file.name}</span>
          </div>
          <div class="text-[10px] text-emerald-300 font-mono mt-0.5">AES-256 Package Loaded (${(file.size / (1024 * 1024)).toFixed(2)} MB) • Key ID: ${parsedMeta.keyId.slice(0, 12)}...</div>
          <div class="mt-2 text-[11px] text-indigo-300 bg-indigo-950/70 py-1.5 px-3 rounded-lg border border-indigo-800/80">
            ✓ Package ready! Enter your access key below and click <strong>"Verify Key & Decrypt Course"</strong>.
          </div>
        `;
      }
      if (encDropzone) {
        encDropzone.classList.remove('border-slate-700');
        encDropzone.classList.add('border-emerald-500/80', 'bg-emerald-950/30');
      }
      if (activationError) activationError.classList.add('hidden');

      if (licenseInput && licenseInput.value.trim().length >= 16 && btnUnlockCourse) {
        btnUnlockCourse.classList.add('ring-4', 'ring-indigo-500/50');
      } else if (licenseInput) {
        licenseInput.focus();
      }
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
      let val = e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, '');
      if (val.length > 56) val = val.substring(0, 56);
      e.target.value = val;
      if (keyLengthCounter) {
        keyLengthCounter.textContent = `${val.length} / 56`;
        if (val.length === 56) keyLengthCounter.className = 'text-[11px] font-mono text-emerald-400 font-bold';
        else keyLengthCounter.className = 'text-[11px] font-mono text-slate-400';
      }
    });
  }

  // Quick Demo Auto-Loader for Instant Testing
  const btnLoadDemo = document.getElementById('btn-load-demo');
  if (btnLoadDemo) {
    btnLoadDemo.addEventListener('click', async () => {
      btnLoadDemo.disabled = true;
      btnLoadDemo.innerHTML = `<span class="animate-pulse">Loading demo course...</span>`;

      try {
        let demoRes = await fetch('/student/c12.enc');
        if (!demoRes.ok) demoRes = await fetch('/student/c12_encrypted.enc');
        if (!demoRes.ok) throw new Error('Demo package not found on server');
        const blob = await demoRes.blob();
        const demoFile = new File([blob], 'c12.enc', { type: 'application/octet-stream' });
        await handleEncFile(demoFile);

        const demoKey = 'KLY9MVXQRCKEDUHCAU6SBWLPXNT9D9UZ5R8TDU95B6RVX3KTSHLNF6HG';
        if (licenseInput) {
          licenseInput.value = demoKey;
          if (keyLengthCounter) {
            keyLengthCounter.textContent = `${demoKey.length} / 56`;
            keyLengthCounter.className = 'text-[11px] font-mono text-emerald-400 font-bold';
          }
        }
        if (btnUnlockCourse) {
          btnUnlockCourse.classList.add('ring-4', 'ring-indigo-500/50', 'animate-pulse');
          setTimeout(() => btnUnlockCourse.classList.remove('animate-pulse'), 2500);
        }
        btnLoadDemo.innerHTML = `<span class="text-emerald-400 font-semibold">✓ Demo Loaded</span>`;
      } catch (err) {
        console.warn('Demo load error:', err);
        showActivationError('Could not auto-load demo course: ' + err.message);
        btnLoadDemo.innerHTML = `<span>Auto-Load Demo (.enc + Key)</span>`;
        btnLoadDemo.disabled = false;
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

      if (key.length < 16) {
        showActivationError(`License key must be at least 16 characters long (Currently ${key.length}).`);
        return;
      }

      btnUnlockCourse.disabled = true;
      btnUnlockCourse.innerHTML = `
        <div class="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent mr-2 inline-block"></div>
        <span>Verifying Key & Decrypting...</span>
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
  // 5. LMS LAUNCH & APNA COLLEGE CURRICULUM RENDERING
  // -------------------------------------------------------------
  const expandedModules = new Set();

  window.toggleModule = function(modIdx) {
    if (expandedModules.has(modIdx)) {
      expandedModules.delete(modIdx);
    } else {
      expandedModules.add(modIdx);
    }
    renderCurriculum();
  };

  function updatePrevNextButtons() {
    const allLessons = getAllLessons();
    if (btnPrevLesson) {
      if (activeLessonIndex <= 0) {
        btnPrevLesson.classList.add('opacity-30', 'cursor-not-allowed');
        btnPrevLesson.classList.remove('hover:text-white', 'cursor-pointer');
      } else {
        btnPrevLesson.classList.remove('opacity-30', 'cursor-not-allowed');
        btnPrevLesson.classList.add('hover:text-white', 'cursor-pointer');
      }
    }
    if (btnNextLesson) {
      if (activeLessonIndex >= allLessons.length - 1) {
        btnNextLesson.classList.add('opacity-30', 'cursor-not-allowed');
        btnNextLesson.classList.remove('hover:text-white', 'cursor-pointer');
      } else {
        btnNextLesson.classList.remove('opacity-30', 'cursor-not-allowed');
        btnNextLesson.classList.add('hover:text-white', 'cursor-pointer');
      }
    }
  }

  if (btnPrevLesson) {
    btnPrevLesson.addEventListener('click', () => {
      if (activeLessonIndex > 0) {
        selectLesson(activeLessonIndex - 1);
      }
    });
  }

  if (btnNextLesson) {
    btnNextLesson.addEventListener('click', () => {
      const all = getAllLessons();
      if (activeLessonIndex < all.length - 1) {
        selectLesson(activeLessonIndex + 1);
      }
    });
  }

  if (btnCollapseSidebar && lmsSidebar) {
    btnCollapseSidebar.addEventListener('click', () => {
      lmsSidebar.classList.add('hidden');
      if (btnExpandSidebar) btnExpandSidebar.classList.remove('hidden');
    });
  }

  if (btnExpandSidebar && lmsSidebar) {
    btnExpandSidebar.addEventListener('click', () => {
      lmsSidebar.classList.remove('hidden');
      btnExpandSidebar.classList.add('hidden');
    });
  }

  if (btnBackCourse) {
    btnBackCourse.addEventListener('click', () => {
      if (confirm('Return to course page?')) {
        lockCourse();
      }
    });
  }

  function launchLmsEnvironment(courseData) {
    if (activationScreen) activationScreen.classList.add('hidden');
    if (lmsScreen) lmsScreen.classList.remove('hidden');

    if (lmsCourseTitle) lmsCourseTitle.textContent = courseData.courseTitle || 'C12';
    if (lmsStudentName) lmsStudentName.textContent = courseData.studentInfo?.name || 'Student';
    if (lmsStudentIp) lmsStudentIp.textContent = `IPv4: ${courseData.studentInfo?.boundIpv4 || '127.0.0.1'}`;

    if (wmApnaEmail) {
      wmApnaEmail.textContent = courseData?.studentInfo?.email || courseData?.studentInfo?.customerEmail || 'rajshubh410@gmail.com';
    }

    startDynamicWatermark(courseData);

    const all = getAllLessons(courseData);
    const firstVideoIdx = all.findIndex(l => l.type === 'video');
    const startIdx = firstVideoIdx >= 0 ? firstVideoIdx : 0;

    if (all[startIdx] && typeof all[startIdx].modIdx === 'number') {
      expandedModules.add(all[startIdx].modIdx);
    } else {
      expandedModules.add(0);
    }

    // Load any previously completed lessons for this course
    studentStore.loadCompletedLessons(courseData?.courseId);

    renderCurriculum(courseData);
    selectLesson(startIdx);
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

    if (expandedModules.size === 0) {
      const allLessons = getAllLessons(data);
      const activeLesson = allLessons[activeLessonIndex];
      if (activeLesson && typeof activeLesson.modIdx === 'number') {
        expandedModules.add(activeLesson.modIdx);
      } else {
        expandedModules.add(0);
      }
    }

    lmsCurriculumList.innerHTML = data.manifest.modules.map((mod, modIdx) => {
      const isExpanded = expandedModules.has(modIdx);
      const lessons = mod.lessons || [];
      const rawTitle = mod.moduleTitle || `Module ${modIdx + 1}`;

      const lessonsHtml = lessons.map(les => {
        const thisIdx = flatCounter++;
        const isActive = (thisIdx === activeLessonIndex);
        const isCompleted = completedSet.has(thisIdx);

        // Icon matching close-up screenshot, turning into checkmark circle when completed
        let iconSvg = '';
        if (isCompleted) {
          iconSvg = `
            <svg class="w-5 h-5 flex-shrink-0 text-emerald-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="10" fill="rgba(16,185,129,0.18)"></circle>
              <polyline points="9 12 11 14 15 10"></polyline>
            </svg>
          `;
        } else if (les.type === 'video') {
          // Circle with play triangle inside (▷)
          iconSvg = `
            <svg class="w-5 h-5 flex-shrink-0 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="10"></circle>
              <polygon points="10 8 16 12 10 16 10 8" fill="currentColor"></polygon>
            </svg>
          `;
        } else if (les.title?.toLowerCase().includes('resource') || les.title?.toLowerCase().includes('installation')) {
          // Open book icon matching Image 1 Installation Resources
          iconSvg = `
            <svg class="w-5 h-5 flex-shrink-0 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
              <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"></path>
              <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"></path>
            </svg>
          `;
        } else if (les.type === 'telegram' || les.url?.includes('t.me')) {
          iconSvg = `
            <svg class="w-5 h-5 flex-shrink-0 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
              <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path>
              <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path>
            </svg>
          `;
        } else {
          // Adobe Acrobat style folded document icon
          iconSvg = `
            <svg class="w-5 h-5 flex-shrink-0 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
              <polyline points="14 2 14 8 20 8"></polyline>
              <line x1="16" y1="13" x2="8" y2="13"></line>
              <line x1="16" y1="17" x2="8" y2="17"></line>
            </svg>
          `;
        }

        const typeLabel = (les.type === 'telegram') ? 'pdf' : (les.type || 'video');
        const defaultDurations = ['02:04:35', '04:04:35', '01:56:30', '02:58:55', '06:02', '01:45:10'];
        const durationText = (les.type === 'video') ? (les.duration || defaultDurations[thisIdx % defaultDurations.length]) : '';

        let subtitleHtml = '';
        if (les.title?.toLowerCase().includes('installation') || les.title?.toLowerCase().includes('resource')) {
          subtitleHtml = `<span class="text-white font-bold text-xs">✓</span> <span>Also available in the Telegram channel</span>`;
        } else if (les.type === 'video') {
          subtitleHtml = isCompleted
            ? `<span class="inline-block w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.8)]"></span> <span class="capitalize text-emerald-400 font-medium">completed</span>`
            : `<span class="inline-block w-1.5 h-1.5 rounded-full bg-[#888e99]"></span> <span class="capitalize">video</span>`;
        } else {
          subtitleHtml = isCompleted
            ? `<span class="text-emerald-400 font-bold text-xs">✓</span> <span class="capitalize text-emerald-400 font-medium">completed</span>`
            : `<span class="text-white font-bold text-xs">✓</span> <span class="capitalize">${typeLabel}</span>`;
        }

        if (isActive) {
          // ACTIVE: #2b313b bg, 6px #6674cc left stripe, checkmark ✓ + pdf/video
          return `
            <div onclick="window.selectLesson(${thisIdx})" 
                 class="bg-[#2b313b] border-l-[6px] border-[#6674cc] text-white px-4 py-3.5 flex items-center justify-between cursor-pointer select-none transition-colors">
              <div class="flex items-center space-x-3 min-w-0 flex-1 mr-2">
                ${iconSvg}
                <div class="min-w-0 flex-1">
                  <div class="text-[13.5px] font-semibold text-white tracking-tight leading-snug truncate">${les.title}</div>
                  <div class="text-[11.5px] text-[#9ca3af] flex items-center space-x-1.5 mt-0.5">
                    ${subtitleHtml}
                  </div>
                </div>
              </div>
              ${durationText ? `<span class="text-[11px] font-mono text-[#888e99] flex-shrink-0">${durationText}</span>` : ''}
            </div>
          `;
        } else {
          // INACTIVE: #1c2026 bg, bullet dot ● + type, duration on right
          return `
            <div onclick="window.selectLesson(${thisIdx})" 
                 class="bg-[#1c2026] hover:bg-[#222731] text-white px-5 py-3.5 flex items-center justify-between cursor-pointer select-none transition-colors border-b border-[#252b35] last:border-b-0">
              <div class="flex items-center space-x-3 min-w-0 flex-1 mr-2">
                ${iconSvg}
                <div class="min-w-0 flex-1">
                  <div class="text-[13.5px] font-medium text-white tracking-tight leading-snug truncate">${les.title}</div>
                  <div class="text-[11.5px] text-[#888e99] flex items-center space-x-1.5 mt-0.5">
                    ${subtitleHtml}
                  </div>
                </div>
              </div>
              ${durationText ? `<span class="text-[11px] font-mono text-[#888e99] flex-shrink-0">${durationText}</span>` : ''}
            </div>
          `;
        }
      }).join('');

      // MODULE HEADER:
      // Live Sessions or Active Module: #6674cc (radiant purple) with pure white text and chevron up ^
      // Other Expanded Modules: #f8f8fd with #525866 text and chevron up ^
      // Collapsed Modules: #f8f8fd with #525866 text and chevron down v
      const isLiveModule = rawTitle.toLowerCase().includes('live session');
      const containsActive = lessons.some((_, i) => (flatCounter - lessons.length + i) === activeLessonIndex);
      const isHighlightedHeader = isExpanded && (isLiveModule || containsActive);

      let headerClasses = 'py-3.5 px-5 cursor-pointer flex items-center justify-between select-none transition-colors border-b border-[#e7e8ed]';
      let titleClasses = 'text-[14px] tracking-tight';
      let chevronSvg = '';

      if (isHighlightedHeader) {
        headerClasses += ' bg-[#6674cc] text-white';
        titleClasses += ' font-semibold text-white';
        chevronSvg = `<svg class="w-4 h-4 text-white flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="18 15 12 9 6 15"></polyline></svg>`;
      } else if (isExpanded) {
        headerClasses += ' bg-[#f8f8fd] hover:bg-[#f0f0f8] text-[#525866]';
        titleClasses += ' font-medium text-[#525866]';
        chevronSvg = `<svg class="w-4 h-4 text-[#87888a] flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="18 15 12 9 6 15"></polyline></svg>`;
      } else {
        headerClasses += ' bg-[#f8f8fd] hover:bg-[#f0f0f8] text-[#525866]';
        titleClasses += ' font-medium text-[#525866]';
        chevronSvg = `<svg class="w-4 h-4 text-[#87888a] flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>`;
      }

      return `
        <div class="border-b border-[#e7e8ed] last:border-b-0">
          <div onclick="window.toggleModule(${modIdx})" 
               class="${headerClasses}">
            <span class="${titleClasses}">${rawTitle}</span>
            ${chevronSvg}
          </div>
          <div class="${isExpanded ? 'block' : 'hidden'} bg-[#1c2026]">
            ${lessonsHtml}
          </div>
        </div>
      `;
    }).join('');

    updateProgress();
    updatePrevNextButtons();
  }

  function selectLesson(flatIdx) {
    const courseData = studentStore.getState().activeCourseData;
    const allLessons = getAllLessons(courseData);
    if (flatIdx < 0 || flatIdx >= allLessons.length) return;

    activeLessonIndex = flatIdx;
    const lesson = allLessons[flatIdx];

    if (typeof lesson.modIdx === 'number') {
      expandedModules.add(lesson.modIdx);
    }

    if (activeLessonTitle) activeLessonTitle.textContent = lesson.title;
    if (activeLessonBadge) activeLessonBadge.textContent = (lesson.type || 'LESSON').toUpperCase();

    // Toggle complete button status
    const isCompleted = studentStore.isLessonCompleted(flatIdx);
    updateCompletionButtonState(isCompleted);

    updatePrevNextButtons();

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

  function updateCompletionButtonState(isCompleted) {
    if (btnCompleteText) {
      btnCompleteText.textContent = isCompleted ? 'Completed' : 'Mark Complete';
    }
    if (btnToggleComplete) {
      if (isCompleted) {
        btnToggleComplete.classList.add('bg-emerald-500/10', 'text-emerald-400', 'border-emerald-500/30');
      } else {
        btnToggleComplete.classList.remove('bg-emerald-500/10', 'text-emerald-400', 'border-emerald-500/30');
      }
    }
  }

  function handleAutoLessonCompletion(lesson) {
    const isAlreadyCompleted = studentStore.isLessonCompleted(activeLessonIndex);
    if (!isAlreadyCompleted) {
      studentStore.markLessonCompleted(activeLessonIndex, true);
      updateCompletionButtonState(true);
      updateProgress();
      renderCurriculum();
      StudentToast.show({
        title: 'Lesson Completed!',
        message: `Watched 75% (3/4) of "${lesson?.title || 'Video'}"`,
        type: 'success',
        duration: 4000
      });
    }
  }

  window.selectLesson = selectLesson;

  if (btnToggleComplete) {
    btnToggleComplete.addEventListener('click', () => {
      const isCompleted = studentStore.isLessonCompleted(activeLessonIndex);
      const nextState = !isCompleted;
      studentStore.markLessonCompleted(activeLessonIndex, nextState);
      updateCompletionButtonState(nextState);
      updateProgress();
      renderCurriculum();
      if (nextState) {
        StudentToast.show({
          title: 'Marked Completed!',
          message: 'Lesson marked as completed in course progress.',
          type: 'success',
          duration: 3000
        });
      }
    });
  }

  function updateProgress() {
    const allLessons = getAllLessons();
    if (allLessons.length === 0) return;
    const completedCount = studentStore.getState().completedLessonIds.size;
    const pct = Math.round((completedCount / allLessons.length) * 100);
    if (lmsProgressText) lmsProgressText.textContent = `${pct} %`;
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
