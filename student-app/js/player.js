/**
 * Student App Video Player Module
 * High-reliability HLS.js streaming via DRM token proxy and local in-memory MP4 playback.
 */

export class VideoPlayerManager {
  constructor(domElements) {
    this.container = domElements.videoContainer;
    this.video = domElements.playerVideo;
    this.spinner = domElements.videoLoadingSpinner;
    this.bigPlayBtn = domElements.videoBigPlayBtn;
    this.errorBanner = domElements.videoErrorBanner;
    this.errorMsg = domElements.videoErrorMsg;
    this.badge = domElements.videoStreamBadge;
    this.btnPlay = domElements.btnVideoPlay;
    this.btnRetry = domElements.btnRetryVideo;
    this.timeline = domElements.videoTimeline;
    this.curTimeDisplay = domElements.videoCurTime;
    this.durDisplay = domElements.videoDuration;
    this.btnMute = domElements.btnVideoMute;
    this.volumeSlider = domElements.videoVolume;
    this.btnFullscreen = domElements.btnVideoFullscreen;
    this.rateSelect = document.getElementById('video-rate-select');

    this.hlsInstance = null;
    this.currentLesson = null;
    this.currentBlobUrl = null;

    this.bindControls();
  }

  bindControls() {
    if (this.btnPlay) {
      this.btnPlay.addEventListener('click', () => this.togglePlay());
    }
    if (this.video) {
      this.video.addEventListener('click', () => this.togglePlay());
      this.video.addEventListener('timeupdate', () => this.onTimeUpdate());
      this.video.addEventListener('loadedmetadata', () => this.onMetadataLoaded());
      this.video.addEventListener('waiting', () => this.spinner?.classList.remove('hidden'));
      this.video.addEventListener('playing', () => this.spinner?.classList.add('hidden'));
    }
    if (this.bigPlayBtn) {
      this.bigPlayBtn.addEventListener('click', () => this.play());
    }
    if (this.btnRetry) {
      this.btnRetry.addEventListener('click', () => {
        this.errorBanner?.classList.add('hidden');
        if (this.currentLesson) this.loadLesson(this.currentLesson);
      });
    }
    if (this.timeline) {
      this.timeline.addEventListener('input', (e) => {
        if (this.video && this.video.duration) {
          this.video.currentTime = (e.target.value / 100) * this.video.duration;
        }
      });
    }
    if (this.volumeSlider) {
      this.volumeSlider.addEventListener('input', (e) => {
        if (this.video) {
          this.video.volume = e.target.value;
          this.video.muted = (e.target.value === '0');
        }
      });
    }
    if (this.btnMute) {
      this.btnMute.addEventListener('click', () => {
        if (this.video) {
          this.video.muted = !this.video.muted;
          if (this.volumeSlider) {
            this.volumeSlider.value = this.video.muted ? 0 : this.video.volume || 1;
          }
        }
      });
    }
    if (this.btnFullscreen) {
      this.btnFullscreen.addEventListener('click', () => {
        if (document.fullscreenElement) {
          document.exitFullscreen().catch(() => {});
        } else if (this.container) {
          this.container.requestFullscreen().catch(() => {});
        }
      });
    }
    if (this.rateSelect) {
      this.rateSelect.addEventListener('change', (e) => {
        if (this.video) {
          this.video.playbackRate = parseFloat(e.target.value) || 1.0;
        }
      });
    }
  }

  loadLesson(lesson, activeCourseData) {
    this.cleanup();
    this.currentLesson = lesson;

    if (this.container) this.container.classList.remove('hidden');
    if (this.spinner) this.spinner.classList.remove('hidden');
    if (this.bigPlayBtn) this.bigPlayBtn.classList.remove('hidden');

    const streamUrl = lesson.url || '';
    let streamSource = streamUrl;

    // Mask stream through DRM stream proxy
    if (activeCourseData && activeCourseData.sessionToken && streamUrl) {
      const b64 = btoa(streamUrl);
      streamSource = `/api/drm/stream/playlist.m3u8?token=${encodeURIComponent(activeCourseData.sessionToken)}&url=${encodeURIComponent(b64)}`;
    }

    if (streamUrl && (streamUrl.includes('.m3u8') || streamUrl.includes('wistia') || lesson.isStreamUrl)) {
      if (this.badge) this.badge.textContent = 'DRM SECURE STREAM';

      if (window.Hls && Hls.isSupported()) {
        this.hlsInstance = new Hls({
          enableWorker: true,
          lowLatencyMode: false,
          maxBufferLength: 20,
          maxMaxBufferLength: 40,
          maxBufferSize: 30 * 1000 * 1000
        });

        this.hlsInstance.loadSource(streamSource);
        this.hlsInstance.attachMedia(this.video);

        let bufferWatchdog = null;
        const resetWatchdog = () => {
          if (bufferWatchdog) clearTimeout(bufferWatchdog);
          bufferWatchdog = null;
        };

        this.video.addEventListener('waiting', () => {
          this.spinner?.classList.remove('hidden');
          // If stuck buffering for > 4.5s on proxy, fallback to direct stream
          if (!bufferWatchdog && streamSource !== streamUrl) {
            bufferWatchdog = setTimeout(() => {
              if (this.video && this.video.paused && streamSource !== streamUrl) {
                console.warn('[DRM Player] Proxy buffering timeout - switching to direct stream');
                streamSource = streamUrl;
                this.hlsInstance?.loadSource(streamUrl);
                this.hlsInstance?.startLoad();
              }
            }, 4500);
          }
        });

        this.video.addEventListener('playing', () => {
          resetWatchdog();
          this.spinner?.classList.add('hidden');
        });
        this.video.addEventListener('canplay', () => {
          resetWatchdog();
          this.spinner?.classList.add('hidden');
        });

        this.hlsInstance.on(Hls.Events.MANIFEST_PARSED, () => {
          resetWatchdog();
          this.spinner?.classList.add('hidden');
          this.play().catch(() => {
            this.bigPlayBtn?.classList.remove('hidden');
          });
        });

        this.hlsInstance.on(Hls.Events.ERROR, (event, data) => {
          if (data.fatal) {
            switch (data.type) {
              case Hls.ErrorTypes.NETWORK_ERROR:
                if (streamSource !== streamUrl) {
                  console.warn('[DRM Player] Proxy network error - fallback to direct stream');
                  streamSource = streamUrl;
                  this.hlsInstance?.loadSource(streamUrl);
                  this.hlsInstance?.startLoad();
                } else {
                  this.hlsInstance?.startLoad();
                }
                break;
              case Hls.ErrorTypes.MEDIA_ERROR:
                this.hlsInstance?.recoverMediaError();
                break;
              default:
                if (streamSource !== streamUrl) {
                  streamSource = streamUrl;
                  this.hlsInstance?.loadSource(streamUrl);
                  this.hlsInstance?.startLoad();
                } else {
                  this.showError(`Stream Error: ${data.details || 'Cannot load stream segment'}`);
                  this.hlsInstance?.destroy();
                }
                break;
            }
          }
        });
      } else if (this.video.canPlayType('application/vnd.apple.mpegurl')) {
        this.video.src = streamUrl;
        this.video.addEventListener('loadedmetadata', () => {
          this.spinner?.classList.add('hidden');
        });
      } else {
        this.showError('HLS streaming is not supported on this browser.');
      }
    } else {
      // Local In-Memory MP4
      if (this.badge) this.badge.textContent = 'LOCAL MP4';
      const blob = activeCourseData?.files?.get(lesson.filename);
      if (blob) {
        this.currentBlobUrl = URL.createObjectURL(blob);
        this.video.src = this.currentBlobUrl;
        this.video.load();
        this.spinner?.classList.add('hidden');
      } else if (streamUrl) {
        this.video.src = streamUrl;
        this.video.load();
        this.spinner?.classList.add('hidden');
      }
    }
  }

  play() {
    if (!this.video) return Promise.reject();
    return this.video.play().then(() => {
      this.bigPlayBtn?.classList.add('hidden');
      this.updatePlayBtn(true);
    });
  }

  pause() {
    if (!this.video) return;
    this.video.pause();
    this.bigPlayBtn?.classList.remove('hidden');
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

  onTimeUpdate() {
    if (!this.video || !this.video.duration) return;
    const cur = this.video.currentTime;
    const dur = this.video.duration;
    if (this.timeline) {
      this.timeline.value = (cur / dur) * 100;
    }
    if (this.curTimeDisplay) {
      this.curTimeDisplay.textContent = this.formatTime(cur);
    }
  }

  onMetadataLoaded() {
    this.spinner?.classList.add('hidden');
    if (this.durDisplay && this.video?.duration) {
      this.durDisplay.textContent = this.formatTime(this.video.duration);
    }
  }

  formatTime(seconds) {
    const s = Math.floor(seconds % 60);
    const m = Math.floor((seconds / 60) % 60);
    const h = Math.floor(seconds / 3600);
    const pad = (n) => String(n).padStart(2, '0');
    if (h > 0) return `${h}:${pad(m)}:${pad(s)}`;
    return `${pad(m)}:${pad(s)}`;
  }

  showError(msg) {
    this.spinner?.classList.add('hidden');
    if (this.errorMsg) this.errorMsg.textContent = msg;
    if (this.errorBanner) this.errorBanner.classList.remove('hidden');
  }

  cleanup() {
    if (this.video) {
      this.video.pause();
      this.video.src = '';
    }
    if (this.hlsInstance) {
      this.hlsInstance.destroy();
      this.hlsInstance = null;
    }
    if (this.currentBlobUrl) {
      URL.revokeObjectURL(this.currentBlobUrl);
      this.currentBlobUrl = null;
    }
    this.errorBanner?.classList.add('hidden');
    this.spinner?.classList.add('hidden');
  }
}
