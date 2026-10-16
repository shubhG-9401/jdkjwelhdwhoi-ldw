/**
 * Student App Security & Anti-Piracy Protection Module
 * 
 * Enforces:
 * 1. Windows PC / Desktop Only (Blocks mobile & tablet access)
 * 2. Focus loss blackout shield (blurs Snipping Tool, OBS, window switchers)
 * 3. Screenshot interceptor & clipboard wiper
 * 4. Screen sharing block (traps getDisplayMedia)
 * 5. DevTools & network inspection detection trap
 */

/**
 * Comprehensive Phone & Phone Desktop Site Hardware Detector
 * Accurately catches smartphones even when "Desktop Site" or "Request Desktop Website" is toggled.
 * 
 * @returns {{ blocked: boolean, reason?: string }}
 */
export function isPhoneOverall() {
  const ua = navigator.userAgent || '';

  // 1. If Client Hints declare mobile is false (Desktop site mode enabled) -> ALLOW
  if (navigator.userAgentData && navigator.userAgentData.mobile === false) {
    return { blocked: false };
  }

  // 2. If User-Agent is desktop mode (no Mobile/iPhone tokens) -> ALLOW
  if (!/Mobile|iPhone|iPod|Opera Mini|Opera Mobi|CriOS|FxiOS|EdgA|EdgIOS|Windows Phone/i.test(ua)) {
    return { blocked: false };
  }

  // 3. Otherwise, standard mobile view is active -> prompt to switch to Desktop site
  return { blocked: true, reason: 'Standard mobile view active. Please enable "Desktop site".' };
}

export class SecurityManager {
  constructor(options = {}) {
    this.onTamper = options.onTamper || (() => {});
    this.screenShield = document.getElementById('screen-shield');
    this.mobileBlockedScreen = document.getElementById('mobile-blocked-screen');
    this.isLockdown = false;
  }

  /**
   * Initializes all security guards and traps.
   */
  init() {
    this.checkMobileBlock();
    this.setupScreenShield();
    this.setupScreenShareBlock();
    this.setupScreenshotTrap();
    this.setupAntiInspectTrap();
    this.setupExtendedDisplayCheck();

    // Continuous dynamic checks against runtime desktop site toggles or rotations
    window.addEventListener('resize', () => this.checkMobileBlock());
    window.addEventListener('orientationchange', () => this.checkMobileBlock());
    window.addEventListener('touchstart', () => this.checkMobileBlock(), { passive: true });
  }

  /**
   * Strictly blocks mobile phones and phone desktop site modes.
   */
  checkMobileBlock() {
    const check = isPhoneOverall();
    if (check.blocked) {
      if (this.mobileBlockedScreen) {
        this.mobileBlockedScreen.classList.remove('hidden');
        this.mobileBlockedScreen.style.display = 'flex';
        this.mobileBlockedScreen.style.pointerEvents = 'auto';
        this.mobileBlockedScreen.style.zIndex = '999999';

        // Update detection details in UI
        const reasonEl = document.getElementById('mobile-block-reason');
        if (reasonEl) {
          reasonEl.textContent = check.reason;
        }
      }

      // Hide and disable any course UI
      const activationScreen = document.getElementById('activation-screen');
      const lmsScreen = document.getElementById('lms-screen');
      if (activationScreen) activationScreen.style.display = 'none';
      if (lmsScreen) lmsScreen.style.display = 'none';

      document.body.style.overflow = 'hidden';
      document.body.style.pointerEvents = 'none';

      this.onTamper(`Mobile / Phone Desktop Site blocked: ${check.reason}`);
      return true;
    }
    return false;
  }

  /**
   * Returns true only when a protected course is active in the LMS viewer.
   * On the activation screen (before course unlock), protection is inert so students
   * can upload .enc files, switch tabs to copy license keys, etc.
   */
  isContentProtected() {
    const lmsScreen = document.getElementById('lms-screen');
    return !!(lmsScreen && !lmsScreen.classList.contains('hidden') && lmsScreen.style.display !== 'none');
  }

  /**
   * Safely dismisses the screen shield and un-obscures the DRM canvas.
   */
  hideShield() {
    if (this.screenShield) {
      this.screenShield.classList.remove('opacity-100');
      this.screenShield.classList.add('opacity-0', 'pointer-events-none');
      this.screenShield.style.pointerEvents = 'none';
    }
    document.body.classList.remove('drm-obscured');
  }

  /**
   * Detects Chromium screen-sharing infobars without triggering on normal browser bookmarks.
   */
  checkInfobarCapture() {
    if (typeof window === 'undefined' || window.innerHeight < 200) return false;
    if (window.visualViewport && window.visualViewport.height > 0) {
      const vDelta = window.innerHeight - window.visualViewport.height;
      if (vDelta > 65) return true;
    }
    return false;
  }

  /**
   * Pitch-black overlay activated whenever focus is lost or capture boundary is crossed
   * while viewing protected course content.
   */
  setupScreenShield() {
    const errorNoticeEl = document.getElementById('shield-error-notice');
    const resumeBtnEl = document.getElementById('btn-resume-shield');
    const shieldTitleEl = document.getElementById('shield-title');
    const shieldStatusEl = document.getElementById('shield-status');

    const showShield = (reason) => {
      // Never block the activation screen where user uploads files or enters license keys!
      if (!this.isContentProtected()) {
        return;
      }

      if (this.screenShield) {
        this.screenShield.classList.remove('opacity-0', 'pointer-events-none', 'hidden');
        this.screenShield.classList.add('opacity-100');
        this.screenShield.style.zIndex = '999999';
        this.screenShield.style.pointerEvents = 'auto';
      }
      document.body.classList.add('drm-obscured');

      // Pause active video if playing
      const video = document.getElementById('player-video') || document.getElementById('video-element');
      if (video && !video.paused) {
        video.pause();
      }

      if (shieldTitleEl) shieldTitleEl.textContent = 'SCREEN SHARING & RECORDING PROHIBITED';
      if (shieldStatusEl) shieldStatusEl.textContent = 'DRM Anti-Capture Active';

      if (reason) {
        console.warn('[DRM ScreenShield]', reason);
      }
    };

    const attemptResume = () => {
      if (this.isLockdown) return;

      // 1. Check document focus
      if (!document.hasFocus()) {
        if (errorNoticeEl) {
          errorNoticeEl.textContent = 'Window not focused. Click inside this browser window to verify.';
          errorNoticeEl.classList.remove('hidden');
        }
        return;
      }

      // 2. Check for active screen sharing infobar
      if (this.checkInfobarCapture()) {
        if (errorNoticeEl) {
          errorNoticeEl.innerHTML = '<strong>SCREEN SHARING ACTIVE:</strong> Screen sharing or capture banner detected. Stop sharing to resume.';
          errorNoticeEl.classList.remove('hidden');
        }
        showShield('Screen sharing actively running');
        return;
      }

      // 3. Check for extended multi-monitor capture setups
      if (window.screen && window.screen.isExtended) {
        if (errorNoticeEl) {
          errorNoticeEl.textContent = 'Multi-monitor / external capture display detected. Please disconnect secondary display to resume.';
          errorNoticeEl.classList.remove('hidden');
        }
        return;
      }

      // All security checks passed -> allow playback to resume
      if (errorNoticeEl) errorNoticeEl.classList.add('hidden');
      this.hideShield();

      // Automatically resume video playback on successful verification
      const video = document.getElementById('player-video') || document.getElementById('video-element');
      if (video && video.paused) {
        video.play().catch(() => {});
      }
    };

    if (resumeBtnEl) {
      resumeBtnEl.addEventListener('click', attemptResume);
    }

    // 1. When focus is lost or user switches tabs (to Google Meet, Zoom, WhatsApp):
    // Blackout immediately while course is active
    window.addEventListener('blur', () => {
      if (!this.isContentProtected()) return;
      showShield('Window blur - Focus lost / External app switched');
    });

    document.addEventListener('visibilitychange', () => {
      if (!this.isContentProtected()) return;
      if (document.hidden) {
        showShield('Document hidden - Tab switched to Google Meet or other application');
      } else {
        // Prompt student to click Verify & Resume
        showShield('Playback locked after tab switch. Click Verify & Resume to continue.');
      }
    });

    // 2. Periodic Focus Polling (Every 300ms) only when course is active
    setInterval(() => {
      if (!this.isLockdown && this.isContentProtected()) {
        if (!document.hasFocus() || document.hidden) {
          showShield('Active polling: Document unfocused or hidden');
        }
      }
    }, 300);

    // 3. Print / Screen Snip Interceptor
    window.addEventListener('beforeprint', () => {
      if (this.isContentProtected()) showShield('Print dialogue requested');
    });
  }

  /**
   * Overrides getDisplayMedia and WebRTC capture to block browser & tab screen sharing.
   */
  setupScreenShareBlock() {
    const blockCapture = (source) => {
      this.triggerLockdown(`Screen sharing or capture attempt detected via ${source}.`);
      throw new DOMException('Screen sharing is strictly prohibited by Course DRM policy.', 'NotAllowedError');
    };

    // Block navigator.mediaDevices.getDisplayMedia
    if (navigator.mediaDevices) {
      navigator.mediaDevices.getDisplayMedia = async () => blockCapture('navigator.mediaDevices.getDisplayMedia');
    }

    // Block prototype method
    if (window.MediaDevices && window.MediaDevices.prototype) {
      window.MediaDevices.prototype.getDisplayMedia = async () => blockCapture('MediaDevices.prototype.getDisplayMedia');
    }

    // Block HTMLMediaElement and Canvas capture streams
    if (HTMLMediaElement.prototype.captureStream) {
      HTMLMediaElement.prototype.captureStream = () => blockCapture('HTMLMediaElement.captureStream');
    }
    if (HTMLCanvasElement.prototype.captureStream) {
      HTMLCanvasElement.prototype.captureStream = () => blockCapture('HTMLCanvasElement.captureStream');
    }

    // Intercept RTCPeerConnection to defeat WebRTC screen share pipes
    if (window.RTCPeerConnection) {
      const origAddTrack = window.RTCPeerConnection.prototype.addTrack;
      if (origAddTrack) {
        window.RTCPeerConnection.prototype.addTrack = function(track, ...streams) {
          if (track && (track.label?.toLowerCase().includes('screen') || track.label?.toLowerCase().includes('display'))) {
            blockCapture('RTCPeerConnection.addTrack(screen)');
          }
          return origAddTrack.call(this, track, ...streams);
        };
      }
    }
  }

  /**
   * Detects multi-monitor and extended display capture setups.
   */
  setupExtendedDisplayCheck() {
    if (window.screen && 'isExtended' in window.screen) {
      const checkExtended = () => {
        if (window.screen.isExtended) {
          this.onTamper('Multi-monitor / extended display detected. Potential external screen capture setup.');
        }
      };
      checkExtended();
      window.screen.addEventListener?.('change', checkExtended);
    }
  }



  /**
   * Traps screenshot hotkeys and clears system clipboard.
   */
  setupScreenshotTrap() {
    const handleCaptureKey = (e) => {
      // Only protect during active course playback, never on the activation/login screen
      if (!this.isContentProtected()) return;

      // PrintScreen
      if (e.key === 'PrintScreen' || e.code === 'PrintScreen' || e.keyCode === 44) {
        if (e.cancelable) e.preventDefault();
        this.wipeClipboard();
        this.flashBlackout('Screenshot blocked by DRM protection.');
        return false;
      }

      // Windows Snipping Tool (Win + Shift + S) or Ctrl + Shift + S
      if (e.shiftKey && (e.metaKey || e.ctrlKey || e.altKey) && (e.key === 'S' || e.key === 's' || e.code === 'KeyS')) {
        if (e.cancelable) e.preventDefault();
        this.wipeClipboard();
        this.flashBlackout('Screen capture shortcut blocked.');
        return false;
      }

      // Alt + PrintScreen
      if (e.altKey && (e.key === 'PrintScreen' || e.code === 'PrintScreen')) {
        if (e.cancelable) e.preventDefault();
        this.wipeClipboard();
        this.flashBlackout('Screenshot blocked.');
        return false;
      }

      // Ctrl + P (Print)
      if ((e.ctrlKey || e.metaKey) && (e.key === 'p' || e.key === 'P' || e.code === 'KeyP')) {
        if (e.cancelable) e.preventDefault();
        this.flashBlackout('Document printing blocked.');
        return false;
      }

      // macOS Screenshot shortcuts (Cmd + Shift + 3, Cmd + Shift + 4, Cmd + Shift + 5)
      if (e.metaKey && e.shiftKey && ['3', '4', '5'].includes(e.key)) {
        if (e.cancelable) e.preventDefault();
        this.wipeClipboard();
        this.flashBlackout('Screenshot blocked.');
        return false;
      }
    };

    window.addEventListener('keydown', handleCaptureKey, true);
    window.addEventListener('keyup', handleCaptureKey, true);
  }

  /**
   * Wipes system clipboard to prevent screenshot storage.
   */
  async wipeClipboard() {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText('');
      }
    } catch {}
  }

  /**
   * Flashes black shield temporarily on screen capture hotkey.
   */
  flashBlackout(message) {
    if (!this.isContentProtected()) return;
    if (!this.screenShield) return;
    this.screenShield.classList.remove('opacity-0', 'pointer-events-none', 'hidden');
    this.screenShield.classList.add('opacity-100');
    document.body.classList.add('drm-obscured');

    const video = document.getElementById('player-video') || document.getElementById('video-element');
    if (video && !video.paused) {
      video.pause();
    }

    setTimeout(() => {
      if (!document.hidden && !this.isLockdown && document.hasFocus()) {
        this.screenShield.classList.remove('opacity-100');
        this.screenShield.classList.add('opacity-0', 'pointer-events-none');
        document.body.classList.remove('drm-obscured');
      }
    }, 2000);

    this.onTamper(message);
  }

  /**
   * Active anti-inspection and DevTools detection trap.
   */
  setupAntiInspectTrap() {
    let triggered = false;

    // Viewport delta check (DevTools dock detection)
    // Docked DevTools takes >= 280px width or >= 320px height
    const checkViewport = () => {
      if (!this.isContentProtected()) return;
      const widthDelta = window.outerWidth - window.innerWidth;
      const heightDelta = window.outerHeight - window.innerHeight;
      if ((widthDelta > 280 || heightDelta > 320) && !triggered) {
        triggered = true;
        this.triggerLockdown('DevTools or Network Inspector detected via viewport delta.');
      }
    };
    window.addEventListener('resize', checkViewport);
    setInterval(checkViewport, 2000);

    // Context menu & keyboard shortcut suppression
    document.addEventListener('contextmenu', (e) => e.preventDefault());
    document.addEventListener('keydown', (e) => {
      if (e.key === 'F12') {
        e.preventDefault();
        this.triggerLockdown('F12 DevTools shortcut blocked.');
      }
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && ['I', 'i', 'J', 'j', 'C', 'c'].includes(e.key)) {
        e.preventDefault();
        this.triggerLockdown('DevTools inspect shortcut blocked.');
      }
      if ((e.ctrlKey || e.metaKey) && ['U', 'u', 'S', 's'].includes(e.key)) {
        e.preventDefault();
      }
    });
  }

  /**
   * Enforces security lockdown upon detection of tampering.
   */
  triggerLockdown(reason) {
    this.isLockdown = true;

    // Halt video and clear source immediately
    const video = document.getElementById('player-video') || document.getElementById('video-element');
    if (video) {
      video.pause();
      video.removeAttribute('src');
      video.load();
    }

    // Display lockdown modal
    const lockdownModal = document.getElementById('tamper-lockdown-screen') || document.getElementById('devtools-lockdown-modal');
    if (lockdownModal) {
      lockdownModal.classList.remove('hidden');
    }

    this.onTamper(reason);
  }
}
