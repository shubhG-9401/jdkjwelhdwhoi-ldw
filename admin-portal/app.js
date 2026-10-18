/**
 * Admin Portal Main Application Coordinator
 * Modularized Architecture
 */

import { authService } from './js/services/authService.js';
import { courseService } from './js/services/courseService.js';
import { licenseService } from './js/services/licenseService.js';
import { logService } from './js/services/logService.js';
import { adminStore } from './js/state.js';
import { Toast } from './js/toast.js';
import {
  renderCoursesList,
  renderCoursesGrid,
  renderLicensesTable,
  renderLogsTable
} from './js/components/tableRenderers.js';
import { CourseEditorComponent } from './js/components/courseEditor.js';
import { LicenseModalComponent } from './js/components/licenseModal.js';
import { systemService } from './js/services/systemService.js';

document.addEventListener('DOMContentLoaded', async () => {
  // -------------------------------------------------------------
  // 1. DOM ELEMENT REFERENCES
  // -------------------------------------------------------------
  // Auth Modal Elements
  const adminLoginModal = document.getElementById('admin-login-modal');
  const adminLoginForm = document.getElementById('admin-login-form');
  const loginIdInput = document.getElementById('login-id');
  const loginPasswordInput = document.getElementById('login-password');
  const loginTotpInput = document.getElementById('login-totp');
  const loginErrorBox = document.getElementById('login-error-box');
  const loginErrorText = document.getElementById('login-error-text');
  const btnAdminLogout = document.getElementById('btn-admin-logout');
  const adminUsernameDisplay = document.getElementById('admin-username-display');

  // Navigation Tabs
  const tabEncryptor = document.getElementById('tab-encryptor') || document.getElementById('tab-encrypt');
  const tabCourses = document.getElementById('tab-courses');
  const tabLicenses = document.getElementById('tab-licenses');
  const tabSecurity = document.getElementById('tab-security');
  const tabAdminAuth = document.getElementById('tab-admin-auth');
  const tabSystem = document.getElementById('tab-system');

  // Content Sections
  const sectionEncryptor = document.getElementById('section-encryptor') || document.getElementById('section-encrypt');
  const sectionCourses = document.getElementById('section-courses');
  const sectionLicenses = document.getElementById('section-licenses');
  const sectionSecurity = document.getElementById('section-security');
  const sectionAdminAuth = document.getElementById('section-admin-auth');
  const sectionSystem = document.getElementById('section-system');

  // Storage & Free Server System Elements
  const serverStatusPill = document.getElementById('server-status-pill');
  const storageStatusDot = document.getElementById('storage-status-dot');
  const storageStatusText = document.getElementById('storage-status-text');
  const badgeSystemStorage = document.getElementById('badge-system-storage');
  const statStorageProvider = document.getElementById('stat-storage-provider');
  const statStorageSub = document.getElementById('stat-storage-sub');
  const statCoursesCount = document.getElementById('stat-courses-count');
  const statLicensesCount = document.getElementById('stat-licenses-count');
  const statLogsCount = document.getElementById('stat-logs-count');
  const btnExportBackup = document.getElementById('btn-export-backup');
  const btnForceSync = document.getElementById('btn-force-sync');
  const inputRestoreBackup = document.getElementById('input-restore-backup');

  // Container Elements
  const courseListContainer = document.getElementById('course-list-container');
  const adminCoursesGrid = document.getElementById('admin-courses-grid');
  const licensesTableBody = document.getElementById('licenses-table-body');
  const licenseTotalCount = document.getElementById('license-total-count');
  const logsTableBody = document.getElementById('logs-table-body');
  const btnRefreshLogs = document.getElementById('btn-refresh-logs');

  // Dashboard Stats
  const statTotalCourses = document.getElementById('stat-total-courses');
  const statTotalLicenses = document.getElementById('stat-total-licenses');
  const statActiveDevices = document.getElementById('stat-active-devices');

  // Course Encrypt Form
  const encryptForm = document.getElementById('encrypt-form');
  const dropzone = document.getElementById('drop-zone') || document.getElementById('file-dropzone');
  const fileInput = document.getElementById('file-input');
  const fileQueue = document.getElementById('file-queue');
  const fileList = document.getElementById('file-list');
  const courseDocText = document.getElementById('course-doc-text') || document.getElementById('courseDocText');
  const btnPreviewDoc = document.getElementById('btn-preview-syllabus') || document.getElementById('btn-preview-doc');
  const parsedPreviewBox = document.getElementById('parsed-preview-box');
  const parsedPreviewContent = document.getElementById('parsed-preview-content');
  const btnEncryptSubmit = document.getElementById('btn-encrypt-submit');

  // Admin Security Settings Tab Elements
  const settingLoginId = document.getElementById('setting-login-id');
  const settingCurrentPass = document.getElementById('setting-current-pass');
  const settingNewPass = document.getElementById('setting-new-pass');
  const settingConfirmPass = document.getElementById('setting-confirm-pass');
  const settingsQrCode = document.getElementById('settings-qr-code');
  const settingsSecretKey = document.getElementById('settings-secret-key');
  const btnCopySecret = document.getElementById('btn-copy-secret');
  const btnRegenSecret = document.getElementById('btn-regen-secret');
  const containerVerifyNewKey = document.getElementById('container-verify-new-key');
  const settingTotpVerify = document.getElementById('setting-totp-verify');
  const btnSaveAdminSecurity = document.getElementById('btn-save-admin-security');
  const securitySaveFeedback = document.getElementById('security-save-feedback');

  // -------------------------------------------------------------
  // 2. INITIALIZE MODAL COMPONENTS
  // -------------------------------------------------------------
  new CourseEditorComponent();
  new LicenseModalComponent();

  // -------------------------------------------------------------
  // 3. REACTIVE STATE SUBSCRIPTIONS
  // -------------------------------------------------------------
  adminStore.subscribe('courses', (courses) => {
    if (statTotalCourses) statTotalCourses.textContent = courses.length;
    renderCoursesList(courses, courseListContainer);
    renderCoursesGrid(courses, adminCoursesGrid);
  });

  adminStore.subscribe('licenses', (licenses) => {
    if (statTotalLicenses) statTotalLicenses.textContent = licenses.length;
    const activeCount = licenses.filter(l => l.boundHwid).length;
    if (statActiveDevices) statActiveDevices.textContent = activeCount;
    renderLicensesTable(licenses, licensesTableBody, licenseTotalCount);
  });

  adminStore.subscribe('securityLogs', (logs) => {
    renderLogsTable(logs, logsTableBody);
  });

  adminStore.subscribe('currentLoginId', (loginId) => {
    if (adminUsernameDisplay) adminUsernameDisplay.textContent = loginId;
  });

  adminStore.subscribe('isAuthenticated', (authed) => {
    if (authed) {
      if (adminLoginModal) adminLoginModal.classList.add('hidden');
    } else {
      showLoginModal();
    }
  });

  // -------------------------------------------------------------
  // 4. AUTHENTICATION HANDLERS
  // -------------------------------------------------------------
  function showLoginModal() {
    if (adminLoginModal) adminLoginModal.classList.remove('hidden');
    if (loginErrorBox) loginErrorBox.classList.add('hidden');
    if (loginTotpInput) loginTotpInput.value = '';
    if (window.lucide) lucide.createIcons();
  }

  if (adminLoginForm) {
    adminLoginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (loginErrorBox) loginErrorBox.classList.add('hidden');

      const loginId = loginIdInput?.value.trim();
      const password = loginPasswordInput?.value;
      const totpToken = loginTotpInput?.value.trim();

      if (!loginId || !password || !totpToken) {
        showLoginError('Please enter username, password, and 6-digit Authenticator code.');
        return;
      }

      const submitBtn = adminLoginForm.querySelector('button[type="submit"]');
      if (submitBtn) submitBtn.disabled = true;

      try {
        await authService.login(loginId, password, totpToken);
        Toast.success(`Welcome back, ${loginId}!`);
        await loadAllData();
      } catch (err) {
        showLoginError(err.message || 'Login failed. Verify credentials and 2FA code.');
      } finally {
        if (submitBtn) submitBtn.disabled = false;
      }
    });
  }

  function showLoginError(msg) {
    if (loginErrorText) loginErrorText.textContent = msg;
    if (loginErrorBox) loginErrorBox.classList.remove('hidden');
  }

  if (btnAdminLogout) {
    btnAdminLogout.addEventListener('click', async () => {
      if (!confirm('Sign out of Admin Portal?')) return;
      await authService.logout();
      Toast.info('Signed out successfully.');
    });
  }

  // -------------------------------------------------------------
  // 5. TAB NAVIGATION
  // -------------------------------------------------------------
  const tabs = [
    { btn: tabEncryptor, sec: sectionEncryptor },
    { btn: tabCourses, sec: sectionCourses },
    { btn: tabLicenses, sec: sectionLicenses },
    { btn: tabSecurity, sec: sectionSecurity },
    { btn: tabAdminAuth, sec: sectionAdminAuth },
    { btn: tabSystem, sec: sectionSystem }
  ];

  function switchTab(activeBtn, activeSec) {
    tabs.forEach(({ btn, sec }) => {
      if (btn) {
        btn.classList.remove('bg-indigo-600', 'text-white', 'shadow-indigo-600/20');
        btn.classList.add('text-slate-400', 'hover:bg-slate-800/60', 'hover:text-slate-200');
      }
      if (sec) sec.classList.add('hidden');
    });

    if (activeBtn) {
      activeBtn.classList.remove('text-slate-400', 'hover:bg-slate-800/60', 'hover:text-slate-200');
      activeBtn.classList.add('bg-indigo-600', 'text-white', 'shadow-indigo-600/20');
    }
    if (activeSec) activeSec.classList.remove('hidden');

    // Trigger tab-specific refresh
    if (activeSec === sectionCourses) courseService.loadCourses();
    else if (activeSec === sectionLicenses) {
      licenseService.loadLicenses();
      courseService.loadCourses();
    } else if (activeSec === sectionSecurity) logService.loadLogs();
    else if (activeSec === sectionAdminAuth) loadAdminSecurityInfo();
    else if (activeSec === sectionSystem) loadSystemStatus();

    if (window.lucide) lucide.createIcons();
  }

  window.switchAdminTab = (tabName) => {
    if (tabName === 'licenses') switchTab(tabLicenses, sectionLicenses);
    else if (tabName === 'courses') switchTab(tabCourses, sectionCourses);
    else if (tabName === 'encrypt') switchTab(tabEncryptor, sectionEncryptor);
    else if (tabName === 'security') switchTab(tabSecurity, sectionSecurity);
    else if (tabName === 'auth') switchTab(tabAdminAuth, sectionAdminAuth);
    else if (tabName === 'system') switchTab(tabSystem, sectionSystem);
  };

  if (serverStatusPill) {
    serverStatusPill.addEventListener('click', () => switchTab(tabSystem, sectionSystem));
  }

  tabs.forEach(({ btn, sec }) => {
    if (btn) btn.addEventListener('click', () => switchTab(btn, sec));
  });

  const btnRefreshLicenses = document.getElementById('btn-refresh-licenses');
  if (btnRefreshLicenses) {
    btnRefreshLicenses.addEventListener('click', async () => {
      btnRefreshLicenses.disabled = true;
      const oldHtml = btnRefreshLicenses.innerHTML;
      btnRefreshLicenses.innerHTML = `
        <div class="animate-spin rounded-full h-3 w-3 border-2 border-slate-300 border-t-transparent mr-1 inline-block"></div>
        <span>Refreshing...</span>
      `;
      try {
        await licenseService.loadLicenses();
        Toast.success('License list refreshed from database.');
      } catch (err) {
        Toast.error('Refresh failed: ' + err.message);
      } finally {
        btnRefreshLicenses.disabled = false;
        btnRefreshLicenses.innerHTML = oldHtml;
        if (window.lucide) lucide.createIcons();
      }
    });
  }

  // Insert Sigma 12 Sample Syllabus Handler
  const btnInsertSample = document.getElementById('btn-insert-sample');
  if (btnInsertSample && courseDocText) {
    btnInsertSample.addEventListener('click', () => {
      const sampleText = `Course name :- Sigma 12
1. welcome to sigma
https://www.pdffiller.com/s/k_zyV2H-p
2. Live sessions
   1. https://embed-cloudfront.wistia.com/deliveries/45ed8874a993895cdec4c4ab62e03ed3123f94b9.m3u8
   2. https://embed-cloudfront.wistia.com/deliveries/45ed8874a993895cdec4c4ab62e03ed3123f94b9.m3u8
   3. https://embed-cloudfront.wistia.com/deliveries/0b3c71c755926770a668cd45fab1210caf94871d.m3u8
   4. https://embed-cloudfront.wistia.com/deliveries/9e6e0420fb258ca63592a6456c613ad0bed3eef1.m3u8
3. telegram
   https://t.me/+OxL7CIMC5c03MjE9
4. introduction
   1. https://embed-cloudfront.wistia.com/deliveries/d2dcbdabc09822bded8bfbea344db4c44595943b.m3u8
   2. https://embed-cloudfront.wistia.com/deliveries/38acfcc098fb0d5215d53fb7f4563d406afc3968.m3u8
   3. https://embed-cloudfront.wistia.com/deliveries/3ee5894d7ec413bda0c24f55a6a5028688c62fcb.m3u8
   4. https://embed-cloudfront.wistia.com/deliveries/c69ee95be0785b9061ccfee490c167bfdea29159.m3u8
5. pre requirements
https://embed-cloudfront.wistia.com/deliveries/17d7e449d095832e9c7bc8b279dfc1cd23532510.m3u8
https://ibb.co/8LnvmC6P
6. Html level 1
https://embed-cloudfront.wistia.com/deliveries/a1add416a5c3312b7d5ff709ad4a0c8d2f1f704b.m3u8
https://embed-cloudfront.wistia.com/deliveries/32b3c15d038272a1c0ecef98064345b170b5c346.m3u8
https://embed-cloudfront.wistia.com/deliveries/67bb6f6309c73aa02f705ddb7bb9dc1f5b357b73.m3u8
https://embed-cloudfront.wistia.com/deliveries/efdb4f1fa10c160d92ba1ab6e07197166ab6ae39.m3u8
https://embed-cloudfront.wistia.com/deliveries/039a17e24e720ea8abf41f8f9f59d28fabf9f87d.m3u8
https://embed-cloudfront.wistia.com/deliveries/7d407c20e919f96ee6e93b023e9b0cc6e535c2ad.m3u8
https://embed-cloudfront.wistia.com/deliveries/67bb6f6309c73aa02f705ddb7bb9dc1f5b357b73.m3u8`;
      courseDocText.value = sampleText;
      const titleInput = document.getElementById('course-title');
      if (titleInput && !titleInput.value) titleInput.value = 'Sigma 12';
      Toast.success('Inserted Sigma 12 sample course syllabus!');
    });
  }

  // -------------------------------------------------------------
  // 6. ENCRYPT COURSE FORM & FILE QUEUE
  // -------------------------------------------------------------
  let selectedFiles = [];

  if (dropzone && fileInput) {
    dropzone.addEventListener('click', () => fileInput.click());
    dropzone.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropzone.classList.add('border-indigo-500', 'bg-indigo-950/20');
    });
    dropzone.addEventListener('dragleave', () => {
      dropzone.classList.remove('border-indigo-500', 'bg-indigo-950/20');
    });
    dropzone.addEventListener('drop', (e) => {
      e.preventDefault();
      dropzone.classList.remove('border-indigo-500', 'bg-indigo-950/20');
      if (e.dataTransfer.files?.length > 0) addFiles(Array.from(e.dataTransfer.files));
    });
    fileInput.addEventListener('change', () => {
      if (fileInput.files?.length > 0) addFiles(Array.from(fileInput.files));
    });
  }

  function addFiles(newFiles) {
    selectedFiles.push(...newFiles);
    renderFileQueue();
  }

  function renderFileQueue() {
    if (!fileQueue || !fileList) return;
    if (selectedFiles.length === 0) {
      fileQueue.classList.add('hidden');
      return;
    }
    fileQueue.classList.remove('hidden');
    fileList.innerHTML = selectedFiles.map((file, idx) => `
      <div class="flex items-center justify-between p-2.5 rounded-xl bg-slate-950 border border-slate-800 text-xs">
        <div class="flex items-center space-x-2 truncate">
          <i data-lucide="file" class="w-3.5 h-3.5 text-indigo-400 flex-shrink-0"></i>
          <span class="text-slate-200 truncate">${file.name}</span>
          <span class="text-slate-500 font-mono text-[10px]">(${(file.size / 1024).toFixed(1)} KB)</span>
        </div>
        <button type="button" onclick="window.removeFileFromQueue(${idx})" class="text-slate-500 hover:text-rose-400 p-1">
          <i data-lucide="x" class="w-3.5 h-3.5"></i>
        </button>
      </div>
    `).join('');
    if (window.lucide) lucide.createIcons();
  }

  window.removeFileFromQueue = function(idx) {
    selectedFiles.splice(idx, 1);
    renderFileQueue();
  };

  // Preview Document Syllabus
  if (btnPreviewDoc) {
    btnPreviewDoc.addEventListener('click', async () => {
      const text = courseDocText?.value.trim() || '';
      const docFile = selectedFiles.find(f => f.name.endsWith('.docx') || f.name.endsWith('.doc') || f.name.endsWith('.txt'));

      if (!text && !docFile) {
        Toast.error('Please paste syllabus text or upload a .docx/.txt file to preview.');
        return;
      }

      const formData = new FormData();
      if (text) formData.append('docText', text);
      if (docFile) formData.append('docFile', docFile);

      btnPreviewDoc.disabled = true;
      btnPreviewDoc.innerHTML = `<span class="animate-spin mr-1">⌛</span> Parsing...`;

      try {
        const data = await courseService.previewDoc(formData);
        if (parsedPreviewBox && parsedPreviewContent) {
          parsedPreviewBox.classList.remove('hidden');
          parsedPreviewContent.innerHTML = `
            <div class="font-bold text-white mb-2">Detected Course: ${data.courseName || 'Custom Syllabus'} (${data.moduleCount} Modules)</div>
            ${data.modules.map(m => `
              <div class="p-2 bg-slate-900 rounded-lg border border-slate-800 space-y-1">
                <div class="font-semibold text-indigo-300">${m.moduleTitle}</div>
                <div class="text-[11px] text-slate-400">${(m.lessons || []).length} lessons</div>
              </div>
            `).join('')}
          `;
        }
        Toast.success(`Parsed ${data.moduleCount} modules successfully!`);
      } catch (err) {
        Toast.error('Document parse error: ' + err.message);
      } finally {
        btnPreviewDoc.disabled = false;
        btnPreviewDoc.innerHTML = `
          <i data-lucide="scan" class="w-4 h-4"></i>
          <span>Preview Syllabus Structure</span>
        `;
        if (window.lucide) lucide.createIcons();
      }
    });
  }

  // Encrypt & Package Course Submit
  if (encryptForm) {
    encryptForm.addEventListener('submit', async (e) => {
      e.preventDefault();

      const title = document.getElementById('course-title')?.value.trim();
      const description = document.getElementById('course-description')?.value.trim();
      const text = courseDocText?.value.trim() || '';

      if (selectedFiles.length === 0 && !text) {
        Toast.error('Please upload at least one course asset or paste syllabus content.');
        return;
      }

      const formData = new FormData();
      formData.append('title', title);
      formData.append('description', description);
      if (text) formData.append('courseDocText', text);
      selectedFiles.forEach(file => formData.append('files', file));

      if (btnEncryptSubmit) {
        btnEncryptSubmit.disabled = true;
        btnEncryptSubmit.innerHTML = `
          <div class="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent mr-2 inline-block"></div>
          <span>Encrypting AES-256 Bundle...</span>
        `;
      }

      try {
        const data = await courseService.encryptCourse(formData);
        Toast.success(`Course "${data.course.title}" packaged and encrypted with AES-256!\nMaster key stored securely on server.`);

        encryptForm.reset();
        selectedFiles = [];
        renderFileQueue();
        if (parsedPreviewBox) parsedPreviewBox.classList.add('hidden');

        switchTab(tabCourses, sectionCourses);
      } catch (err) {
        Toast.error('Encryption failed: ' + err.message);
      } finally {
        if (btnEncryptSubmit) {
          btnEncryptSubmit.disabled = false;
          btnEncryptSubmit.innerHTML = `
            <i data-lucide="lock" class="w-4 h-4"></i>
            <span>Encrypt & Package Course Bundle</span>
          `;
          if (window.lucide) lucide.createIcons();
        }
      }
    });
  }

  // -------------------------------------------------------------
  // 7. GLOBAL WINDOW ACTION HELPERS (Exposed for HTML Event Handlers)
  // -------------------------------------------------------------
  window.copyToClipboard = function(text) {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(text);
      Toast.success('Copied to clipboard:\n' + text);
    }
  };

  window.revokeLicense = async function(licenseKey) {
    if (!confirm(`Revoke license key ${licenseKey}?\nThe student will be immediately blocked from accessing the course.`)) return;
    try {
      await licenseService.revokeLicense(licenseKey);
      Toast.info(`License ${licenseKey} has been revoked.`);
    } catch (err) {
      Toast.error('Failed to revoke license: ' + err.message);
    }
  };

  window.resetDeviceLock = async function(licenseKey) {
    if (!confirm(`Reset HWID & IPv4/IPv6 binding for ${licenseKey}?\nThe student can bind a new computer on their next login.`)) return;
    try {
      await licenseService.resetDeviceLock(licenseKey);
      Toast.success(`Device lock reset for ${licenseKey}.`);
    } catch (err) {
      Toast.error('Failed to reset device lock: ' + err.message);
    }
  };

  window.deleteCourse = async function(courseId) {
    const course = adminStore.getState().courses.find(c => c.id === courseId);
    if (!confirm(`Delete course "${course?.title || courseId}"?\nThis removes the course from the database and deletes the .enc file.`)) return;

    try {
      await courseService.deleteCourse(courseId);
      Toast.info(`Course "${course?.title || courseId}" deleted.`);
    } catch (err) {
      Toast.error('Failed to delete course: ' + err.message);
    }
  };

  window.deleteLicense = async function(licenseKey) {
    if (!confirm(`Permanently DELETE license key ${licenseKey}?\nThis action will remove the license from the database.`)) return;
    try {
      await licenseService.deleteLicense(licenseKey);
      Toast.success(`License ${licenseKey} permanently deleted.`);
      loadSystemStatus();
    } catch (err) {
      Toast.error('Failed to delete license: ' + err.message);
    }
  };

  if (btnRefreshLogs) {
    btnRefreshLogs.addEventListener('click', async () => {
      await logService.loadLogs();
      Toast.info('Security audit logs refreshed.');
    });
  }

  // -------------------------------------------------------------
  // 8. ADMIN SECURITY & 2FA SETTINGS TAB
  // -------------------------------------------------------------
  let candidateSecret = null;

  async function loadAdminSecurityInfo() {
    try {
      const data = await authService.getSetupInfo();
      if (settingLoginId) settingLoginId.value = data.loginId || 'admin';
      if (settingsSecretKey) settingsSecretKey.textContent = data.secret;
      if (settingsQrCode) settingsQrCode.src = data.qrCodeDataUrl;
    } catch (err) {
      console.warn('Could not load 2FA info:', err.message);
    }
  }

  if (btnCopySecret) {
    btnCopySecret.addEventListener('click', () => {
      const secret = settingsSecretKey?.textContent || '';
      window.copyToClipboard(secret);
    });
  }

  if (btnRegenSecret) {
    btnRegenSecret.addEventListener('click', async () => {
      if (!confirm('Generate a new Authenticator secret key?\nYou will need to scan the new QR code and verify a 6-digit code.')) return;
      try {
        const data = await authService.generateNewSecret();
        candidateSecret = data.secret;
        if (settingsSecretKey) settingsSecretKey.textContent = data.secret;
        if (settingsQrCode) settingsQrCode.src = data.qrCodeDataUrl;
        if (containerVerifyNewKey) containerVerifyNewKey.classList.remove('hidden');
        Toast.warning('New secret generated. Scan QR code and enter 6-digit confirmation code below.');
      } catch (err) {
        Toast.error('Failed to generate secret: ' + err.message);
      }
    });
  }

  if (btnSaveAdminSecurity) {
    btnSaveAdminSecurity.addEventListener('click', async () => {
      const newLoginId = settingLoginId?.value.trim();
      const currentPassword = settingCurrentPass?.value;
      const newPassword = settingNewPass?.value;
      const confirmPass = settingConfirmPass?.value;
      const totpVerificationCode = settingTotpVerify?.value.trim();

      if (!currentPassword) {
        Toast.error('Please enter your current password to save security changes.');
        settingCurrentPass?.focus();
        return;
      }

      if (newPassword && newPassword !== confirmPass) {
        Toast.error('New password and confirmation do not match.');
        return;
      }

      btnSaveAdminSecurity.disabled = true;
      try {
        const res = await authService.updateCredentials({
          newLoginId,
          currentPassword,
          newPassword: newPassword || undefined,
          newTotpSecret: candidateSecret || undefined,
          totpVerificationCode: totpVerificationCode || undefined
        });

        Toast.success(res.message || 'Admin security credentials updated!');
        if (settingCurrentPass) settingCurrentPass.value = '';
        if (settingNewPass) settingNewPass.value = '';
        if (settingConfirmPass) settingConfirmPass.value = '';
        if (containerVerifyNewKey) containerVerifyNewKey.classList.add('hidden');
        candidateSecret = null;
        await loadAdminSecurityInfo();
      } catch (err) {
        Toast.error('Update failed: ' + err.message);
      } finally {
        btnSaveAdminSecurity.disabled = false;
      }
    });
  }

  // -------------------------------------------------------------
  // 8B. SYSTEM PERSISTENCE & FREE SERVER STATUS
  // -------------------------------------------------------------
  async function loadSystemStatus() {
    try {
      const res = await systemService.getStatus();
      if (!res || !res.storageProvider) return;

      const providerLabels = {
        render: 'Render Server (Persistent)',
        upstash_redis: 'Upstash Redis KV (Cloud)',
        github_sync: 'GitHub Auto-Sync (Cloud)',
        local_persistent: 'Local Disk (Persistent)',
        vercel_ephemeral: 'Vercel /tmp (Ephemeral Warning)'
      };

      const isSafe = res.isPersistent;

      if (storageStatusDot) {
        storageStatusDot.className = isSafe
          ? 'w-2 h-2 rounded-full bg-emerald-400 animate-pulse'
          : 'w-2 h-2 rounded-full bg-amber-400 animate-pulse';
      }

      if (storageStatusText) {
        storageStatusText.textContent = isSafe
          ? (res.isRender ? 'Render: Online' : 'Cloud DB: Active')
          : 'Storage: Ephemeral /tmp';
      }

      if (badgeSystemStorage) {
        badgeSystemStorage.className = isSafe
          ? 'px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
          : 'px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/30';
        badgeSystemStorage.textContent = isSafe ? 'Persistent Storage Active' : 'Ephemeral Storage (/tmp)';
      }

      if (statStorageProvider) {
        statStorageProvider.textContent = providerLabels[res.storageProvider] || res.storageProvider;
      }

      if (statStorageSub) {
        statStorageSub.textContent = res.guidance || 'Protected against container resets';
      }

      if (statCoursesCount) statCoursesCount.textContent = res.courseCount || 0;
      if (statLicensesCount) statLicensesCount.textContent = res.licenseCount || 0;
      if (statLogsCount) statLogsCount.textContent = res.logCount || 0;

    } catch (err) {
      console.warn('[SYSTEM STATUS WARN]', err.message);
    }
  }

  // Backup Export
  if (btnExportBackup) {
    btnExportBackup.addEventListener('click', () => {
      systemService.downloadBackup();
      Toast.success('Database backup downloaded successfully.');
    });
  }

  // Backup Import / Restore
  if (inputRestoreBackup) {
    inputRestoreBackup.addEventListener('change', async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;

      if (!confirm(`Import and restore database from "${file.name}"?\nThis will merge/update existing courses, licenses, and security logs.`)) {
        inputRestoreBackup.value = '';
        return;
      }

      try {
        const text = await file.text();
        const json = JSON.parse(text);
        const res = await systemService.restoreBackup(json);
        Toast.success(res.message || 'Database restored successfully!');
        inputRestoreBackup.value = '';
        await loadAllData();
      } catch (err) {
        Toast.error('Restore failed: ' + err.message);
        inputRestoreBackup.value = '';
      }
    });
  }

  // Cloud Sync Now
  if (btnForceSync) {
    btnForceSync.addEventListener('click', async () => {
      btnForceSync.disabled = true;
      const oldHtml = btnForceSync.innerHTML;
      btnForceSync.innerHTML = `
        <div class="animate-spin rounded-full h-3 w-3 border-2 border-white border-t-transparent mr-1 inline-block"></div>
        <span>Syncing...</span>
      `;
      try {
        const res = await systemService.forceSync();
        Toast.success(res.message || 'Cloud database synchronized.');
        await loadAllData();
      } catch (err) {
        Toast.error('Sync failed: ' + err.message);
      } finally {
        btnForceSync.disabled = false;
        btnForceSync.innerHTML = oldHtml;
        if (window.lucide) lucide.createIcons();
      }
    });
  }

  // -------------------------------------------------------------
  // 9. APP INITIALIZATION & LIFECYCLE
  // -------------------------------------------------------------
  async function loadAllData() {
    await Promise.all([
      courseService.loadCourses(),
      licenseService.loadLicenses(),
      logService.loadLogs(),
      loadAdminSecurityInfo(),
      loadSystemStatus()
    ]);
  }

  const isAuthenticated = await authService.checkStatus();
  if (isAuthenticated) {
    await loadAllData();
  } else {
    showLoginModal();
  }

  if (window.lucide) lucide.createIcons();
});
