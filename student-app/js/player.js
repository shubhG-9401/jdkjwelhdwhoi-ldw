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

    this.hlsInstance = null;
    this.currentLesson = null;
    this.currentBlobUrl = null;
    this.isSeeking = false;
    this.onThresholdComplete = domElements.onThresholdComplete || null;
    this.hasTriggeredCompletion = false;

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
        this.checkWatchThreshold(true);
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
    this.hasTriggeredCompletion = false;

    if (this.container) this.container.classList.remove('hidden');
    if (this.spinner) this.spinner.classList.remove('hidden');
    if (this.bigPlayBtn) this.bigPlayBtn.classList.remove('hidden');
    if (this.errorBanner) this.errorBanner.classList.add('hidden');

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

    // Check for 3/4 video completion threshold
    this.checkWatchThreshold();
  }

  checkWatchThreshold(force = false) {
    if (!this.video || !this.video.duration || this.hasTriggeredCompletion) return;
    const cur = this.video.currentTime || 0;
    const dur = this.video.duration;
    // 3/4 (75%) Video Completion Threshold
    if (dur > 0 && (force || (cur / dur) >= 0.75)) {
      this.hasTriggeredCompletion = true;
      if (typeof this.onThresholdComplete === 'function') {
        this.onThresholdComplete(this.currentLesson, cur, dur);
      }
    }
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

  cleanup() {
    this.hasTriggeredCompletion = false;
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
