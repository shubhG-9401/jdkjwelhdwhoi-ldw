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
  }

  /**
   * Strictly blocks mobile phones and tablets.
   */
  checkMobileBlock() {
    const ua = navigator.userAgent || '';
    const isMobileUa = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Mobile|mobile|CriOS/i.test(ua);
    const hasTouchScreen = (navigator.maxTouchPoints > 1);
    const isNarrowViewport = (window.innerWidth < 900);

    if (isMobileUa || (hasTouchScreen && isNarrowViewport)) {
      if (this.mobileBlockedScreen) {
        this.mobileBlockedScreen.classList.remove('hidden');
      }
      // Disable interaction
      document.body.style.overflow = 'hidden';
      document.body.style.pointerEvents = 'none';
      if (this.mobileBlockedScreen) {
        this.mobileBlockedScreen.style.pointerEvents = 'auto';
      }
      return true;
    }
    return false;
  }

  /**
   * Pitch-black overlay activated whenever focus is lost.
   * Defeats Windows Snipping Tool (Win+Shift+S), PrintScreen, OBS window captures, screen recording software.
   */
  setupScreenShield() {
    const showShield = () => {
      if (this.screenShield) {
        this.screenShield.classList.remove('opacity-0', 'pointer-events-none', 'hidden');
        this.screenShield.classList.add('opacity-100');
      }
      document.body.classList.add('drm-obscured');

      // Pause active video if playing
      const video = document.getElementById('player-video') || document.getElementById('video-element');
      if (video && !video.paused) {
        video.pause();
      }
    };

    const hideShield = () => {
      if (this.screenShield && !this.isLockdown) {
        this.screenShield.classList.remove('opacity-100');
        this.screenShield.classList.add('opacity-0', 'pointer-events-none');
      }
      document.body.classList.remove('drm-obscured');
    };

    // Trigger on both window and document events
    window.addEventListener('blur', showShield);
    window.addEventListener('focus', hideShield);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) showShield();
      else hideShield();
    });

    // Also trigger blackout if mouse leaves window towards top/sides (common when taking snips)
    document.addEventListener('mouseleave', () => {
      showShield();
    });
    document.addEventListener('mouseenter', () => {
      if (!this.isLockdown) hideShield();
    });
  }

  /**
   * Overrides getDisplayMedia to block browser screen sharing.
   */
  setupScreenShareBlock() {
    if (navigator.mediaDevices) {
      navigator.mediaDevices.getDisplayMedia = async () => {
        this.triggerLockdown('Screen sharing or capture attempt detected.');
        throw new DOMException('Screen sharing is prohibited by Course DRM policy.', 'NotAllowedError');
      };
    }
  }

  /**
   * Traps screenshot hotkeys and clears system clipboard.
   */
  setupScreenshotTrap() {
    const handleCaptureKey = (e) => {
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
    const checkViewport = () => {
      const widthDelta = window.outerWidth - window.innerWidth > 170;
      const heightDelta = window.outerHeight - window.innerHeight > 170;
      if ((widthDelta || heightDelta) && !triggered) {
        triggered = true;
        this.triggerLockdown('DevTools or Network Inspector detected via viewport delta.');
      }
    };
    window.addEventListener('resize', checkViewport);
    setInterval(checkViewport, 1500);

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
    const video = document.getElementById('video-element');
    if (video) {
      video.pause();
      video.src = '';
    }

    // Display lockdown modal
    const lockdownModal = document.getElementById('devtools-lockdown-modal');
    if (lockdownModal) {
      lockdownModal.classList.remove('hidden');
    }

    this.onTamper(reason);
  }
}
