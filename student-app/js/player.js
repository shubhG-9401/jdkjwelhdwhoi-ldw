/**
 * Student App Video Player Module
 * High-performance, zero-stall video player supporting HLS streams (Wistia, CloudFront, .m3u8)
 * and in-memory local MP4 playback with comprehensive DRM watermark protection.
 */

export class VideoPlayerManager {
  constructor(domElements = {}) {
    this.container = domElements.videoContainer || document.getElementById('video-container');
    this.video = domElements.playerVideo || document.getElementById('player-video');
    this.spinner = domElements.videoLoadingSpinner || document.getElementById('video-loading-spinner');
    this.bigPlayBtn = domElements.videoBigPlayBtn || document.getElementById('video-big-play-btn');
    this.errorBanner = domElements.videoErrorBanner || document.getElementById('video-error-banner');
    this.errorMsg = domElements.videoErrorMsg || document.getElementById('video-error-msg');
    this.badge = domElements.videoStreamBadge || document.getElementById('video-stream-badge');
    this.btnPlay = domElements.btnVideoPlay || document.getElementById('btn-video-play');
    this.btnRewind = document.getElementById('btn-video-rewind');
    this.btnForward = document.getElementById('btn-video-forward');
    this.btnRetry = domElements.btnRetryVideo || document.getElementById('btn-retry-video');
    this.timeline = domElements.videoTimeline || document.getElementById('video-seek');
    this.timeDisplay = domElements.videoTimeDisplay || document.getElementById('video-time');
    this.curTimeDisplay = domElements.videoCurTime;
    this.durDisplay = domElements.videoDuration;
    this.btnMute = domElements.btnVideoMute || document.getElementById('btn-video-mute');
    this.volumeSlider = domElements.videoVolume || document.getElementById('video-volume');
    this.btnFullscreen = domElements.btnVideoFullscreen || document.getElementById('btn-video-fullscreen');
    this.rateSelect = document.getElementById('video-speed') || document.getElementById('video-rate-select');

    // Anti-Screenshare Dynamic Forensic Canvas & Strobe Engine
    this.watermarkCanvas = document.getElementById('drm-watermark-canvas');
    this.canvasCtx = this.watermarkCanvas?.getContext('2d');
    this.animFrameId = null;
    this.frameCount = 0;
    this.studentIdentity = {
      name: 'Authorized Student',
      phone: '',
      ip: '127.0.0.1',
      hwid: 'HWID-SECURE',
      licenseKey: 'LIC-XXXX'
    };
    this.badge1Pos = { x: 40, y: 50, targetX: 40, targetY: 50 };
    this.badge2Pos = { x: 200, y: 180, targetX: 200, targetY: 180 };
    this.badgeMoveTimer = null;

    this.hlsInstance = null;
    this.currentLesson = null;
    this.currentBlobUrl = null;
    this.isSeeking = false;

    this.bindControls();
  }

  bindControls() {
    // Play / Pause toggles
    if (this.btnPlay) {
      this.btnPlay.addEventListener('click', () => this.togglePlay());
    }
    if (this.bigPlayBtn) {
      this.bigPlayBtn.addEventListener('click', () => this.play());
    }
    if (this.video) {
      this.video.addEventListener('click', () => this.togglePlay());
      this.video.addEventListener('timeupdate', () => this.onTimeUpdate());
      this.video.addEventListener('loadedmetadata', () => this.onMetadataLoaded());
      this.video.addEventListener('waiting', () => {
        if (this.spinner) this.spinner.classList.remove('hidden');
      });
      this.video.addEventListener('playing', () => {
        if (this.spinner) this.spinner.classList.add('hidden');
        if (this.bigPlayBtn) this.bigPlayBtn.classList.add('hidden');
        this.updatePlayBtn(true);
      });
      this.video.addEventListener('pause', () => {
        this.updatePlayBtn(false);
      });
      this.video.addEventListener('ended', () => {
        this.updatePlayBtn(false);
        if (this.bigPlayBtn) this.bigPlayBtn.classList.remove('hidden');
      });
      this.video.addEventListener('canplay', () => {
        if (this.spinner) this.spinner.classList.add('hidden');
      });
    }

    // Rewind 10s
    if (this.btnRewind) {
      this.btnRewind.addEventListener('click', () => {
        if (this.video) this.video.currentTime = Math.max(0, this.video.currentTime - 10);
      });
    }

    // Forward 10s
    if (this.btnForward) {
      this.btnForward.addEventListener('click', () => {
        if (this.video && this.video.duration) {
          this.video.currentTime = Math.min(this.video.duration, this.video.currentTime + 10);
        }
      });
    }

    // Retry Button
    if (this.btnRetry) {
      this.btnRetry.addEventListener('click', () => {
        if (this.errorBanner) this.errorBanner.classList.add('hidden');
        if (this.currentLesson) this.loadLesson(this.currentLesson);
      });
    }

    // Timeline Scrubbing
    if (this.timeline) {
      this.timeline.addEventListener('mousedown', () => { this.isSeeking = true; });
      this.timeline.addEventListener('mouseup', () => { this.isSeeking = false; });
      this.timeline.addEventListener('input', (e) => {
        if (this.video && this.video.duration) {
          const targetTime = (parseFloat(e.target.value) / 100) * this.video.duration;
          this.video.currentTime = targetTime;
          const curFmt = this.formatTime(targetTime);
          const durFmt = this.formatTime(this.video.duration);
          if (this.timeDisplay) this.timeDisplay.textContent = `${curFmt} / ${durFmt}`;
          if (this.curTimeDisplay) this.curTimeDisplay.textContent = curFmt;
        }
      });
    }

    // Volume & Mute
    if (this.volumeSlider) {
      this.volumeSlider.addEventListener('input', (e) => {
        if (this.video) {
          const val = parseFloat(e.target.value);
          this.video.volume = val;
          this.video.muted = (val === 0);
          this.updateMuteIcon(this.video.muted);
        }
      });
    }
    if (this.btnMute) {
      this.btnMute.addEventListener('click', () => {
        if (this.video) {
          this.video.muted = !this.video.muted;
          if (this.volumeSlider) {
            this.volumeSlider.value = this.video.muted ? 0 : (this.video.volume || 1);
          }
          this.updateMuteIcon(this.video.muted);
        }
      });
    }

    // Playback Speed
    if (this.rateSelect) {
      this.rateSelect.addEventListener('change', (e) => {
        if (this.video) {
          this.video.playbackRate = parseFloat(e.target.value) || 1.0;
        }
      });
    }

    // Fullscreen
    if (this.btnFullscreen) {
      this.btnFullscreen.addEventListener('click', () => this.toggleFullscreen());
    }

    // Global Video Hotkeys
    document.addEventListener('keydown', (e) => {
      if (!this.container || this.container.classList.contains('hidden')) return;
      if (['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName)) return;

      if (e.code === 'Space') {
        e.preventDefault();
        this.togglePlay();
      } else if (e.code === 'ArrowLeft') {
        e.preventDefault();
        if (this.video) this.video.currentTime = Math.max(0, this.video.currentTime - 5);
      } else if (e.code === 'ArrowRight') {
        e.preventDefault();
        if (this.video && this.video.duration) {
          this.video.currentTime = Math.min(this.video.duration, this.video.currentTime + 5);
        }
      } else if (e.code === 'KeyF') {
        e.preventDefault();
        this.toggleFullscreen();
      } else if (e.code === 'KeyM') {
        e.preventDefault();
        if (this.btnMute) this.btnMute.click();
      }
    });
  }

  loadLesson(lesson, activeCourseData) {
    this.cleanup();
    this.currentLesson = lesson;

    if (activeCourseData?.studentInfo) {
      this.setStudentIdentity(
        activeCourseData.studentInfo,
        activeCourseData.hwid,
        activeCourseData.studentInfo.boundIpv4,
        activeCourseData.studentInfo.boundIpv6,
        activeCourseData.licenseKey
      );
    } else {
      this.startWatermarkEngine();
    }

    if (this.container) this.container.classList.remove('hidden');
    if (this.spinner) this.spinner.classList.remove('hidden');
    if (this.bigPlayBtn) this.bigPlayBtn.classList.remove('hidden');
    if (this.errorBanner) this.errorBanner.classList.add('hidden');

    if (this.video) {
      this.video.muted = false;
      this.video.volume = 1.0;
      if (this.volumeSlider) this.volumeSlider.value = 1.0;
      this.updateMuteIcon(false);
    }

    const streamUrl = (lesson.url || '').trim();

    // Check if this is an HLS stream (Wistia, CloudFront, .m3u8)
    const isHls = streamUrl && (
      streamUrl.includes('.m3u8') ||
      streamUrl.includes('wistia') ||
      streamUrl.includes('cloudfront') ||
      lesson.isStreamUrl
    );

    if (isHls) {
      if (this.badge) this.badge.textContent = 'DRM SECURE STREAM';
      this.loadHlsStream(streamUrl, activeCourseData?.sessionToken);
    } else {
      // Local In-Memory MP4 from decrypted package, or direct video URL
      const localBlob = activeCourseData?.files?.get(lesson.filename);
      if (localBlob) {
        if (this.badge) this.badge.textContent = 'OFFLINE ENCRYPTED MP4';
        this.currentBlobUrl = URL.createObjectURL(localBlob);
        this.loadDirectVideo(this.currentBlobUrl);
      } else if (streamUrl) {
        if (this.badge) this.badge.textContent = 'DIRECT VIDEO';
        this.loadDirectVideo(streamUrl);
      } else {
        this.showError('No playable video source found for this lesson.');
      }
    }
  }

  loadHlsStream(url, sessionToken) {
    if (window.Hls && Hls.isSupported()) {
      if (this.hlsInstance) {
        this.hlsInstance.destroy();
        this.hlsInstance = null;
      }

      this.hlsInstance = new Hls({
        enableWorker: true,
        lowLatencyMode: false,
        backBufferLength: 90,
        maxBufferLength: 30,
        maxMaxBufferLength: 60,
        maxBufferSize: 60 * 1000 * 1000
      });

      this.hlsInstance.loadSource(url);
      this.hlsInstance.attachMedia(this.video);

      this.hlsInstance.on(Hls.Events.MANIFEST_PARSED, () => {
        if (this.spinner) this.spinner.classList.add('hidden');
        this.play().catch(() => {
          if (this.bigPlayBtn) this.bigPlayBtn.classList.remove('hidden');
        });
      });

      this.hlsInstance.on(Hls.Events.ERROR, (event, data) => {
        console.warn('[HLS Event]', data.type, data.details);
        if (data.fatal) {
          switch (data.type) {
            case Hls.ErrorTypes.NETWORK_ERROR:
              if (sessionToken && !url.includes('/api/drm/stream/playlist.m3u8')) {
                const proxyUrl = `/api/drm/stream/playlist.m3u8?token=${encodeURIComponent(sessionToken)}&url=${encodeURIComponent(url)}`;
                console.log('Falling back to DRM stream proxy:', proxyUrl);
                this.hlsInstance.loadSource(proxyUrl);
                return;
              }
              console.log('Recovering HLS network error...');
              this.hlsInstance?.startLoad();
              break;
            case Hls.ErrorTypes.MEDIA_ERROR:
              console.log('Recovering HLS media error...');
              this.hlsInstance?.recoverMediaError();
              break;
            default:
              this.showError(`Stream Error: ${data.details || 'Unable to play video stream'}`);
              this.hlsInstance?.destroy();
              break;
          }
        }
      });
    } else if (this.video && this.video.canPlayType('application/vnd.apple.mpegurl')) {
      // Native Safari / iOS HLS
      this.video.src = url;
      this.video.addEventListener('loadedmetadata', () => {
        if (this.spinner) this.spinner.classList.add('hidden');
        this.play().catch(() => {});
      }, { once: true });
    } else {
      this.showError('HLS streaming library failed to initialize on this browser.');
    }
  }

  loadDirectVideo(src) {
    if (!this.video) return;
    this.video.src = src;
    this.video.load();
    this.video.addEventListener('loadedmetadata', () => {
      if (this.spinner) this.spinner.classList.add('hidden');
      this.play().catch(() => {
        if (this.bigPlayBtn) this.bigPlayBtn.classList.remove('hidden');
      });
    }, { once: true });
  }

  play() {
    if (!this.video) return Promise.reject();

    // Ensure audio is fully unmuted and volume is maximum
    this.video.muted = false;
    const vol = this.volumeSlider ? parseFloat(this.volumeSlider.value) : 1;
    this.video.volume = (isNaN(vol) || vol <= 0) ? 1.0 : vol;
    if (this.volumeSlider) {
      this.volumeSlider.value = this.video.volume;
    }
    this.updateMuteIcon(false);

    return this.video.play().then(() => {
      if (this.bigPlayBtn) this.bigPlayBtn.classList.add('hidden');
      if (this.spinner) this.spinner.classList.add('hidden');
      this.updatePlayBtn(true);
    }).catch(err => {
      console.warn('Autoplay prevented:', err.message);
      if (this.bigPlayBtn) this.bigPlayBtn.classList.remove('hidden');
    });
  }

  pause() {
    if (!this.video) return;
    this.video.pause();
    if (this.bigPlayBtn) this.bigPlayBtn.classList.remove('hidden');
    this.updatePlayBtn(false);
  }

  togglePlay() {
    if (!this.video) return;
    if (this.video.paused) this.play();
    else this.pause();
  }

  updatePlayBtn(isPlaying) {
    if (!this.btnPlay) return;
    this.btnPlay.innerHTML = `<i data-lucide="${isPlaying ? 'pause' : 'play'}" class="w-5 h-5"></i>`;
    if (window.lucide) lucide.createIcons();
  }

  updateMuteIcon(isMuted) {
    if (!this.btnMute) return;
    this.btnMute.innerHTML = `<i data-lucide="${isMuted ? 'volume-x' : 'volume-2'}" class="w-4 h-4"></i>`;
    if (window.lucide) lucide.createIcons();
  }

  toggleFullscreen() {
    if (!this.container) return;
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    } else {
      this.container.requestFullscreen().catch(() => {});
    }
  }

  onTimeUpdate() {
    if (!this.video || !this.video.duration || this.isSeeking) return;
    const cur = this.video.currentTime;
    const dur = this.video.duration;
    if (this.timeline) {
      this.timeline.value = (cur / dur) * 100;
    }
    const curFmt = this.formatTime(cur);
    const durFmt = this.formatTime(dur);
    if (this.timeDisplay) {
      this.timeDisplay.textContent = `${curFmt} / ${durFmt}`;
    }
    if (this.curTimeDisplay) this.curTimeDisplay.textContent = curFmt;
    if (this.durDisplay) this.durDisplay.textContent = durFmt;
  }

  onMetadataLoaded() {
    if (this.spinner) this.spinner.classList.add('hidden');
    if (this.video && this.video.duration) {
      const curFmt = this.formatTime(this.video.currentTime || 0);
      const durFmt = this.formatTime(this.video.duration);
      if (this.timeDisplay) {
        this.timeDisplay.textContent = `${curFmt} / ${durFmt}`;
      }
      if (this.durDisplay) this.durDisplay.textContent = durFmt;
    }
  }

  formatTime(seconds) {
    if (isNaN(seconds) || seconds < 0) return '00:00';
    const s = Math.floor(seconds % 60);
    const m = Math.floor((seconds / 60) % 60);
    const h = Math.floor(seconds / 3600);
    const pad = (n) => String(n).padStart(2, '0');
    if (h > 0) return `${h}:${pad(m)}:${pad(s)}`;
    return `${pad(m)}:${pad(s)}`;
  }

  showError(msg) {
    if (this.spinner) this.spinner.classList.add('hidden');
    if (this.errorMsg) this.errorMsg.textContent = msg;
    if (this.errorBanner) this.errorBanner.classList.remove('hidden');
  }

  setStudentIdentity(info, hwid, ipv4, ipv6, licenseKey) {
    const ipParts = [];
    if (ipv4) ipParts.push(ipv4);
    if (ipv6 && ipv6 !== '::1') ipParts.push(ipv6);
    const ipStr = ipParts.join(' • ') || '127.0.0.1';

    this.studentIdentity = {
      name: info?.name || 'Authorized Student',
      phone: info?.phone || '',
      ip: ipStr,
      hwid: hwid || 'HWID-SECURE',
      licenseKey: licenseKey || 'LIC-PROTECTED'
    };
    this.startWatermarkEngine();
  }

  startWatermarkEngine() {
    if (!this.watermarkCanvas || !this.canvasCtx) return;

    if (this.badgeMoveTimer) clearInterval(this.badgeMoveTimer);
    this.badgeMoveTimer = setInterval(() => {
      if (!this.container) return;
      const rect = this.container.getBoundingClientRect();
      const maxX = Math.max(20, rect.width - 340);
      const maxY = Math.max(20, rect.height - 110);
      this.badge1Pos.targetX = 20 + Math.random() * maxX;
      this.badge1Pos.targetY = 20 + Math.random() * maxY;

      this.badge2Pos.targetX = 20 + Math.random() * maxX;
      this.badge2Pos.targetY = 20 + Math.random() * maxY;
    }, 1800);

    const renderLoop = () => {
      if (!this.watermarkCanvas || !this.canvasCtx || !this.container) return;
      const rect = this.container.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) {
        this.animFrameId = requestAnimationFrame(renderLoop);
        return;
      }

      const dpr = window.devicePixelRatio || 1;
      const targetW = Math.round(rect.width * dpr);
      const targetH = Math.round(rect.height * dpr);
      if (this.watermarkCanvas.width !== targetW || this.watermarkCanvas.height !== targetH) {
        this.watermarkCanvas.width = targetW;
        this.watermarkCanvas.height = targetH;
      }

      const ctx = this.canvasCtx;
      ctx.save();
      ctx.scale(dpr, dpr);
      const width = rect.width;
      const height = rect.height;

      ctx.clearRect(0, 0, width, height);
      this.frameCount++;

      // When DRM screen shield is active or window is unfocused: paint 100% solid pitch-black over video
      if (document.body.classList.contains('drm-obscured') || !document.hasFocus() || document.hidden) {
        ctx.fillStyle = '#000000';
        ctx.fillRect(0, 0, width, height);
        ctx.save();
        ctx.font = '700 15px ui-monospace, SFMono-Regular, monospace';
        ctx.fillStyle = '#f87171';
        ctx.textAlign = 'center';
        ctx.fillText('SCREEN RECORDING & SHARING BLOCKED', width / 2, height / 2 - 8);
        ctx.font = '11px ui-monospace, SFMono-Regular, monospace';
        ctx.fillStyle = '#94a3b8';
        ctx.fillText('Google Meet / Zoom Screen Capture Prohibited by DRM', width / 2, height / 2 + 14);
        ctx.restore();
        this.animFrameId = requestAnimationFrame(renderLoop);
        return;
      }

      // 1. Anti-Capture Temporal Strobe (Defeats Zoom, Meet, OBS 5-15fps Temporal Compression)
      const isPlaying = this.video && !this.video.paused && !this.video.ended;
      if (isPlaying) {
        const strobePhase = this.frameCount % 2;
        if (strobePhase === 1) {
          ctx.fillStyle = 'rgba(0, 0, 0, 0.035)';
          ctx.fillRect(0, 0, width, height);
        }
      }

      // 2. High-Density Diagonal Forensic Security Lattice
      ctx.save();
      ctx.rotate(-0.35); // ~20 degree tilt
      ctx.font = '700 12px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace';
      ctx.fillStyle = 'rgba(255, 255, 255, 0.16)';
      ctx.textBaseline = 'middle';

      const latticeText = `DRM SECURE • ${this.studentIdentity.name} • ${this.studentIdentity.ip} • HWID:${this.studentIdentity.hwid.slice(0, 8)} • PROHIBITED TO SCREENSHARE`;
      const textMetrics = ctx.measureText(latticeText);
      const textWidth = textMetrics.width + 100;
      const rowSpacing = 60;

      const startX = -width;
      const endX = width * 2;
      const startY = -height;
      const endY = height * 2;

      for (let y = startY; y < endY; y += rowSpacing) {
        for (let x = startX; x < endX; x += textWidth) {
          ctx.fillText(latticeText, x, y);
        }
      }
      ctx.restore();

      // 3. Smooth badge position interpolation
      this.badge1Pos.x += (this.badge1Pos.targetX - this.badge1Pos.x) * 0.08;
      this.badge1Pos.y += (this.badge1Pos.targetY - this.badge1Pos.y) * 0.08;
      this.badge2Pos.x += (this.badge2Pos.targetX - this.badge2Pos.x) * 0.08;
      this.badge2Pos.y += (this.badge2Pos.targetY - this.badge2Pos.y) * 0.08;

      // 4. Primary Floating High-Contrast Security Badge
      this.drawSecurityBadge(ctx, this.badge1Pos.x, this.badge1Pos.y, [
        { text: '● LIVE DRM MONITORED STREAM', color: '#38bdf8', bold: true },
        { text: `STUDENT: ${this.studentIdentity.name} | ${this.studentIdentity.ip}`, color: '#ffffff' },
        { text: `HWID: ${this.studentIdentity.hwid} | ${new Date().toLocaleTimeString()} UTC`, color: '#a5b4fc' },
        { text: 'ZOOM / MEET / OBS SCREEN RECORDING PROHIBITED', color: '#f87171', bold: true }
      ]);

      // 5. Secondary Floating Security Pill
      this.drawSecurityBadge(ctx, this.badge2Pos.x, this.badge2Pos.y, [
        { text: '⚠ LICENSED BROADCAST ONLY', color: '#fbbf24', bold: true },
        { text: `KEY: ${this.studentIdentity.licenseKey.slice(0, 24)}...`, color: '#cbd5e1' }
      ]);

      ctx.restore();
      this.animFrameId = requestAnimationFrame(renderLoop);
    };

    if (this.animFrameId) cancelAnimationFrame(this.animFrameId);
    this.animFrameId = requestAnimationFrame(renderLoop);
  }

  drawSecurityBadge(ctx, x, y, lines) {
    ctx.save();
    ctx.font = '11px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace';
    
    let maxTextWidth = 0;
    lines.forEach(l => {
      const w = ctx.measureText(l.text).width;
      if (w > maxTextWidth) maxTextWidth = w;
    });

    const padX = 12;
    const padY = 8;
    const lineH = 15;
    const boxW = maxTextWidth + padX * 2;
    const boxH = lines.length * lineH + padY * 2;
    const radius = 10;

    // Draw background rounded box
    ctx.fillStyle = 'rgba(3, 7, 18, 0.82)';
    ctx.strokeStyle = 'rgba(99, 102, 241, 0.45)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    if (ctx.roundRect) {
      ctx.roundRect(x, y, boxW, boxH, radius);
    } else {
      ctx.rect(x, y, boxW, boxH);
    }
    ctx.fill();
    ctx.stroke();

    // Draw text lines
    lines.forEach((l, idx) => {
      ctx.font = `${l.bold ? '700' : '500'} 10px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
      ctx.fillStyle = l.color || '#ffffff';
      ctx.fillText(l.text, x + padX, y + padY + (idx + 1) * lineH - 3);
    });

    ctx.restore();
  }

  cleanup() {
    if (this.animFrameId) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }
    if (this.badgeMoveTimer) {
      clearInterval(this.badgeMoveTimer);
      this.badgeMoveTimer = null;
    }
    if (this.canvasCtx && this.watermarkCanvas) {
      this.canvasCtx.clearRect(0, 0, this.watermarkCanvas.width, this.watermarkCanvas.height);
    }
    if (this.video) {
      this.video.pause();
      this.video.removeAttribute('src');
      this.video.load();
    }
    if (this.hlsInstance) {
      this.hlsInstance.destroy();
      this.hlsInstance = null;
    }
    if (this.currentBlobUrl) {
      URL.revokeObjectURL(this.currentBlobUrl);
      this.currentBlobUrl = null;
    }
    if (this.errorBanner) this.errorBanner.classList.add('hidden');
    if (this.spinner) this.spinner.classList.add('hidden');
    if (this.container) this.container.classList.add('hidden');
    this.updatePlayBtn(false);
  }
}
