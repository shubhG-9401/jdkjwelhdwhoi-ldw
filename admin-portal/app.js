// Admin Portal Logic with Course Editor, 2FA Authenticator & 56-Char Licenses
document.addEventListener('DOMContentLoaded', () => {
  if (window.lucide) lucide.createIcons();

  // State
  let courses = [];
  let licenses = [];
  let selectedFiles = [];
  let currentMode = 'text'; // 'text' | 'upload'
  let activeEditingCourseId = null;
  let activeEditingModules = [];
  let candidateTotpSecret = null;

  // DOM Elements - Server Status & Admin User
  const serverStatusPill = document.getElementById('server-status-pill');
  const adminUsernameDisplay = document.getElementById('admin-username-display');
  const btnAdminLogout = document.getElementById('btn-admin-logout');

  // DOM Elements - Login Modal
  const adminLoginModal = document.getElementById('admin-login-modal');
  const adminLoginForm = document.getElementById('admin-login-form');
  const loginIdInput = document.getElementById('login-id');
  const loginPasswordInput = document.getElementById('login-password');
  const loginTotpInput = document.getElementById('login-totp');
  const loginErrorBox = document.getElementById('login-error-box');
  const loginErrorText = document.getElementById('login-error-text');

  // DOM Elements - Navigation Tabs
  const tabEncryptor = document.getElementById('tab-encryptor');
  const tabCourses = document.getElementById('tab-courses');
  const tabLicenses = document.getElementById('tab-licenses');
  const tabSecurity = document.getElementById('tab-security');
  const tabAdminAuth = document.getElementById('tab-admin-auth');

  const sectionEncryptor = document.getElementById('section-encryptor');
  const sectionCourses = document.getElementById('section-courses');
  const sectionLicenses = document.getElementById('section-licenses');
  const sectionSecurity = document.getElementById('section-security');
  const sectionAdminAuth = document.getElementById('section-admin-auth');

  // DOM Elements - Mode Switch
  const btnModeText = document.getElementById('btn-mode-text');
  const btnModeUpload = document.getElementById('btn-mode-upload');
  const containerModeText = document.getElementById('container-mode-text');
  const containerModeUpload = document.getElementById('container-mode-upload');
  const courseDocText = document.getElementById('course-doc-text');
  const btnInsertSample = document.getElementById('btn-insert-sample');
  const btnPreviewSyllabus = document.getElementById('btn-preview-syllabus');
  const previewStatusPill = document.getElementById('preview-status-pill');
  const parsedPreviewBox = document.getElementById('parsed-preview-box');
  const previewTitleBadge = document.getElementById('preview-title-badge');
  const previewCountsBadge = document.getElementById('preview-counts-badge');
  const previewModulesList = document.getElementById('preview-modules-list');

  // DOM Elements - Encryptor Form
  const encryptForm = document.getElementById('encrypt-form');
  const courseTitleInput = document.getElementById('course-title');
  const dropZone = document.getElementById('drop-zone');
  const fileInput = document.getElementById('file-input');
  const fileQueueContainer = document.getElementById('file-queue-container');
  const fileQueue = document.getElementById('file-queue');
  const fileCount = document.getElementById('file-count');
  const clearFilesBtn = document.getElementById('clear-files-btn');
  const encryptProgress = document.getElementById('encrypt-progress');
  const btnEncryptSubmit = document.getElementById('btn-encrypt-submit');
  const courseListContainer = document.getElementById('course-list');

  // DOM Elements - Courses Tab
  const adminCoursesGrid = document.getElementById('admin-courses-grid');
  const btnQuickNewCourse = document.getElementById('btn-quick-new-course');

  // DOM Elements - Course Editor Modal
  const courseEditorModal = document.getElementById('course-editor-modal');
  const editorModalTitle = document.getElementById('editor-modal-title');
  const editorCourseTitle = document.getElementById('editor-course-title');
  const editorCourseDesc = document.getElementById('editor-course-desc');
  const editorModulesList = document.getElementById('editor-modules-list');
  const btnEditorAddModule = document.getElementById('btn-editor-add-module');
  const btnCloseCourseEditor = document.getElementById('btn-close-course-editor');
  const btnCancelCourseEditor = document.getElementById('btn-cancel-course-editor');
  const btnSaveCourseEditor = document.getElementById('btn-save-course-editor');

  // DOM Elements - Licenses
  const btnOpenCreateLicense = document.getElementById('btn-open-create-license');
  const btnCloseLicenseModal = document.getElementById('btn-close-license-modal');
  const btnCancelLicense = document.getElementById('btn-cancel-license');
  const licenseModal = document.getElementById('license-modal');
  const createLicenseForm = document.getElementById('create-license-form');
  const licCourseSelect = document.getElementById('lic-course-select');
  const licensesTableBody = document.getElementById('licenses-table-body');
  const licenseTotalCount = document.getElementById('license-total-count');
  const strictIpContainer = document.getElementById('strict-ip-container');
  const ipLockRadios = document.querySelectorAll('input[name="ipLockMode"]');

  // DOM Elements - Security Logs
  const logsTableBody = document.getElementById('logs-table-body');
  const btnRefreshLogs = document.getElementById('btn-refresh-logs');
  const statGranted = document.getElementById('stat-granted');
  const statBlocked = document.getElementById('stat-blocked');
  const statActiveDevices = document.getElementById('stat-active-devices');

  // DOM Elements - Admin Security Settings Tab
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
  // 1. AUTHENTICATION & SESSION MANAGEMENT
  // -------------------------------------------------------------
  function getAuthToken() {
    return sessionStorage.getItem('admin_token') || '';
  }

  function getAuthHeaders() {
    const token = getAuthToken();
    return token ? { 'Authorization': `Bearer ${token}` } : {};
  }

  function showLoginModal() {
    adminLoginModal.classList.remove('hidden');
    loginErrorBox.classList.add('hidden');
    loginTotpInput.value = '';
    if (window.lucide) lucide.createIcons();
  }

  function hideLoginModal() {
    adminLoginModal.classList.add('hidden');
  }

  async function checkAuthStatus() {
    const token = getAuthToken();
    if (!token) {
      showLoginModal();
      return false;
    }

    try {
      const res = await fetch('/api/admin/auth/status', {
        headers: getAuthHeaders()
      });
      const data = await res.json();
      if (data.authenticated) {
        hideLoginModal();
        adminUsernameDisplay.textContent = data.loginId || 'admin';
        return true;
      } else {
        sessionStorage.removeItem('admin_token');
        showLoginModal();
        return false;
      }
    } catch (err) {
      showLoginModal();
      return false;
    }
  }

  // Handle Login Form Submit
  adminLoginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    loginErrorBox.classList.add('hidden');

    const loginId = loginIdInput.value.trim();
    const password = loginPasswordInput.value;
    const totpToken = loginTotpInput.value.trim();

    if (!loginId || !password || !totpToken) {
      showLoginError('Please fill in username, password, and 6-digit Authenticator code.');
      return;
    }

    try {
      const res = await fetch('/api/admin/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ loginId, password, totpToken })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Authentication failed.');
      }

      sessionStorage.setItem('admin_token', data.token);
      adminUsernameDisplay.textContent = data.loginId;
      hideLoginModal();

      // Load portal data
      loadCourses();
      loadLicenses();
      loadLogs();
      loadAdminSecurityInfo();
    } catch (err) {
      showLoginError(err.message);
    }
  });

  function showLoginError(msg) {
    loginErrorText.textContent = msg;
    loginErrorBox.classList.remove('hidden');
  }

  // Admin Logout
  btnAdminLogout.addEventListener('click', async () => {
    if (!confirm('Sign out of Admin Portal?')) return;
    try {
      await fetch('/api/admin/auth/logout', {
        method: 'POST',
        headers: getAuthHeaders()
      });
    } catch (e) {}
    sessionStorage.removeItem('admin_token');
    showLoginModal();
  });

  // Server Health Check
  async function checkServerHealth() {
    try {
      const res = await fetch('/api/health');
      if (res.ok) {
        serverStatusPill.className = 'flex items-center space-x-1.5 px-3 py-1 rounded-full text-xs font-mono bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 mr-2';
        serverStatusPill.innerHTML = `<span class="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span><span>Server: Online</span>`;
      } else {
        throw new Error('Not OK');
      }
    } catch (e) {
      serverStatusPill.className = 'flex items-center space-x-1.5 px-3 py-1 rounded-full text-xs font-mono bg-rose-500/10 text-rose-400 border border-rose-500/20 mr-2';
      serverStatusPill.innerHTML = `<span class="w-2 h-2 rounded-full bg-rose-400"></span><span>Server: Disconnected</span>`;
    }
  }

  checkServerHealth();
  setInterval(checkServerHealth, 15000);

  // -------------------------------------------------------------
  // 2. TAB NAVIGATION
  // -------------------------------------------------------------
  const allTabs = [tabEncryptor, tabCourses, tabLicenses, tabSecurity, tabAdminAuth];
  const allSections = [sectionEncryptor, sectionCourses, sectionLicenses, sectionSecurity, sectionAdminAuth];

  function switchTab(activeTab, activeSection) {
    allTabs.forEach(t => {
      if (t) {
        t.classList.remove('active', 'text-white');
        t.classList.add('text-slate-400');
      }
    });
    allSections.forEach(s => {
      if (s) s.classList.add('hidden');
    });

    if (activeTab) {
      activeTab.classList.add('active', 'text-white');
      activeTab.classList.remove('text-slate-400');
    }
    if (activeSection) {
      activeSection.classList.remove('hidden');
    }

    if (activeSection === sectionCourses) {
      loadCourses();
    } else if (activeSection === sectionLicenses) {
      loadLicenses();
      loadCourses();
    } else if (activeSection === sectionSecurity) {
      loadLogs();
    } else if (activeSection === sectionAdminAuth) {
      loadAdminSecurityInfo();
    }

    if (window.lucide) lucide.createIcons();
  }

  tabEncryptor.addEventListener('click', () => switchTab(tabEncryptor, sectionEncryptor));
  tabCourses.addEventListener('click', () => switchTab(tabCourses, sectionCourses));
  tabLicenses.addEventListener('click', () => switchTab(tabLicenses, sectionLicenses));
  tabSecurity.addEventListener('click', () => switchTab(tabSecurity, sectionSecurity));
  tabAdminAuth.addEventListener('click', () => switchTab(tabAdminAuth, sectionAdminAuth));

  if (btnQuickNewCourse) {
    btnQuickNewCourse.addEventListener('click', () => switchTab(tabEncryptor, sectionEncryptor));
  }

  // -------------------------------------------------------------
  // 3. COURSE ENCRYPTOR MODE SWITCH & LIVE PREVIEW
  // -------------------------------------------------------------
  btnModeText.addEventListener('click', () => {
    currentMode = 'text';
    btnModeText.classList.add('bg-indigo-600', 'text-white');
    btnModeText.classList.remove('text-slate-400');
    btnModeUpload.classList.remove('bg-indigo-600', 'text-white');
    btnModeUpload.classList.add('text-slate-400');
    containerModeText.classList.remove('hidden');
    containerModeUpload.classList.add('hidden');
  });

  btnModeUpload.addEventListener('click', () => {
    currentMode = 'upload';
    btnModeUpload.classList.add('bg-indigo-600', 'text-white');
    btnModeUpload.classList.remove('text-slate-400');
    btnModeText.classList.remove('bg-indigo-600', 'text-white');
    btnModeText.classList.add('text-slate-400');
    containerModeUpload.classList.remove('hidden');
    containerModeText.classList.add('hidden');
  });

  btnInsertSample.addEventListener('click', () => {
    courseDocText.value = `Course name :- Sigma 12
1.welcome to sigma
https://www.pdffiller.com/s/k_zyV2H-p
2 . Live sessions
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
6.Html level 1
https://embed-cloudfront.wistia.com/deliveries/a1add416a5c3312b7d5ff709ad4a0c8d2f1f704b.m3u8
https://embed-cloudfront.wistia.com/deliveries/32b3c15d038272a1c0ecef98064345b170b5c346.m3u8
https://embed-cloudfront.wistia.com/deliveries/67bb6f6309c73aa02f705ddb7bb9dc1f5b357b73.m3u8
https://embed-cloudfront.wistia.com/deliveries/efdb4f1fa10c160d92ba1ab6e07197166ab6ae39.m3u8
https://embed-cloudfront.wistia.com/deliveries/039a17e24e720ea8abf41f8f9f59d28fabf9f87d.m3u8
https://embed-cloudfront.wistia.com/deliveries/7d407c20e919f96ee6e93b023e9b0cc6e535c2ad.m3u8
https://embed-cloudfront.wistia.com/deliveries/67bb6f6309c73aa02f705ddb7bb9dc1f5b357b73.m3u8`;
    triggerPreviewParsing();
  });

  btnPreviewSyllabus.addEventListener('click', triggerPreviewParsing);

  async function triggerPreviewParsing() {
    const text = courseDocText.value.trim();
    if (!text && selectedFiles.length === 0) {
      alert('Please paste document text or select a file first.');
      return;
    }

    previewStatusPill.className = 'text-[10px] px-2 py-0.5 rounded-full font-mono bg-indigo-500/10 text-indigo-400 border border-indigo-500/30';
    previewStatusPill.textContent = 'Parsing...';

    try {
      const formData = new FormData();
      if (text) formData.append('docText', text);
      const docFile = selectedFiles.find(f => f.name.endsWith('.docx') || f.name.endsWith('.doc') || f.name.endsWith('.txt'));
      if (docFile) formData.append('docFile', docFile);

      const res = await fetch('/api/admin/courses/preview-doc', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: formData
      });

      if (res.status === 401) {
        showLoginModal();
        return;
      }

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Parsing failed');

      if (!courseTitleInput.value.trim() && data.courseName) {
        courseTitleInput.value = data.courseName;
      }

      previewTitleBadge.textContent = data.courseName || 'Custom Course';
      const totalLessons = data.modules.reduce((acc, m) => acc + (m.lessons ? m.lessons.length : 0), 0);
      previewCountsBadge.textContent = `${data.moduleCount} Modules • ${totalLessons} Lessons`;

      previewModulesList.innerHTML = data.modules.map((m, idx) => `
        <div class="rounded-xl border border-slate-800 bg-slate-900/60 p-3 space-y-2">
          <div class="text-xs font-semibold text-slate-200 flex items-center justify-between">
            <span>${m.moduleTitle}</span>
            <span class="text-[10px] text-slate-500 font-mono">${m.lessons ? m.lessons.length : 0} items</span>
          </div>
          <div class="space-y-1">
            ${(m.lessons || []).map(l => `
              <div class="text-[11px] flex items-center justify-between p-1.5 rounded-lg bg-slate-950/60 text-slate-400">
                <span class="truncate max-w-[200px] text-slate-300">${l.title}</span>
                <span class="text-[9px] uppercase font-mono px-1.5 py-0.5 rounded bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">${l.type}</span>
              </div>
            `).join('')}
          </div>
        </div>
      `).join('');

      parsedPreviewBox.classList.remove('hidden');
      previewStatusPill.className = 'text-[10px] px-2 py-0.5 rounded-full font-mono bg-emerald-500/10 text-emerald-400 border border-emerald-500/30';
      previewStatusPill.textContent = 'Structured OK';
    } catch (err) {
      previewStatusPill.className = 'text-[10px] px-2 py-0.5 rounded-full font-mono bg-rose-500/10 text-rose-400 border border-rose-500/30';
      previewStatusPill.textContent = 'Parse Error';
      alert('Error parsing document: ' + err.message);
    }
  }

  // Drag and drop file handling
  dropZone.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', (e) => handleFiles(e.target.files));

  dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('border-indigo-500', 'bg-indigo-950/20');
  });

  dropZone.addEventListener('dragleave', () => {
    dropZone.classList.remove('border-indigo-500', 'bg-indigo-950/20');
  });

  dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('border-indigo-500', 'bg-indigo-950/20');
    handleFiles(e.dataTransfer.files);
  });

  function handleFiles(files) {
    for (const file of files) {
      if (!selectedFiles.some(f => f.name === file.name && f.size === file.size)) {
        selectedFiles.push(file);
      }
    }
    renderFileQueue();
  }

  function renderFileQueue() {
    fileCount.textContent = selectedFiles.length;
    if (selectedFiles.length === 0) {
      fileQueueContainer.classList.add('hidden');
      return;
    }

    fileQueueContainer.classList.remove('hidden');
    fileQueue.innerHTML = selectedFiles.map((f, i) => `
      <div class="flex items-center justify-between p-2 rounded-lg bg-slate-950 text-xs">
        <span class="truncate max-w-[200px] text-slate-300">${f.name}</span>
        <button type="button" onclick="removeFile(${i})" class="text-rose-400 hover:text-rose-300">
          <i data-lucide="x" class="w-3.5 h-3.5"></i>
        </button>
      </div>
    `).join('');
    if (window.lucide) lucide.createIcons();
  }

  window.removeFile = function(i) {
    selectedFiles.splice(i, 1);
    renderFileQueue();
  };

  clearFilesBtn.addEventListener('click', () => {
    selectedFiles = [];
    renderFileQueue();
  });

  // Course Encrypt Form Submit
  encryptForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const title = courseTitleInput.value.trim();
    const docText = courseDocText.value.trim();

    if (!title && !docText && selectedFiles.length === 0) {
      alert('Please provide a course title and syllabus text or files.');
      return;
    }

    btnEncryptSubmit.disabled = true;
    encryptProgress.classList.remove('hidden');

    const formData = new FormData();
    formData.append('title', title);
    if (docText) formData.append('courseDocText', docText);
    for (const f of selectedFiles) {
      formData.append('files', f);
    }

    try {
      const res = await fetch('/api/admin/courses/encrypt', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: formData
      });

      if (res.status === 401) {
        showLoginModal();
        return;
      }

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Encryption failed');

      alert(`Course "${data.course.title}" successfully encrypted with AES-256-GCM!\nFile: ${data.course.encryptedFileName} (${(data.course.fileSize / 1024).toFixed(1)} KB)`);

      encryptForm.reset();
      selectedFiles = [];
      renderFileQueue();
      parsedPreviewBox.classList.add('hidden');

      loadCourses();
      switchTab(tabCourses, sectionCourses);
    } catch (err) {
      alert('Error encrypting course: ' + err.message);
    } finally {
      btnEncryptSubmit.disabled = false;
      encryptProgress.classList.add('hidden');
    }
  });

  // -------------------------------------------------------------
  // 4. COURSES MANAGEMENT & CONTENT EDITOR
  // -------------------------------------------------------------
  async function loadCourses() {
    try {
      const res = await fetch('/api/admin/courses', {
        headers: getAuthHeaders()
      });
      const data = await res.json();
      if (data.success) {
        courses = data.courses;
        renderCoursesList();
        renderCoursesGrid();
        updateLicenseCourseSelect();
      }
    } catch (err) {
      console.error('Failed to load courses:', err);
    }
  }

  function renderCoursesList() {
    if (!courseListContainer) return;
    if (courses.length === 0) {
      courseListContainer.innerHTML = `<div class="p-6 text-center text-slate-500 italic text-xs">No courses encrypted yet.</div>`;
      return;
    }

    courseListContainer.innerHTML = courses.map(c => `
      <div class="p-4 rounded-xl border border-slate-800 bg-slate-950/60 flex items-center justify-between">
        <div class="space-y-1">
          <div class="text-sm font-semibold text-white">${c.title}</div>
          <div class="text-xs text-slate-400">${c.moduleCount || 0} Modules • ${(c.fileSize / 1024).toFixed(1)} KB</div>
          <div class="text-[10px] font-mono text-indigo-400">${c.encryptedFileName}</div>
        </div>
        <div class="flex items-center space-x-2">
          <button onclick="window.openCourseEditor('${c.id}')" class="px-3 py-1.5 rounded-lg bg-indigo-600/20 text-indigo-300 hover:bg-indigo-600/30 text-xs font-medium border border-indigo-500/30 transition-all flex items-center space-x-1">
            <i data-lucide="edit-3" class="w-3.5 h-3.5"></i>
            <span>Edit Content</span>
          </button>
          <a href="/api/admin/courses/${c.id}/download" class="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors" title="Download .enc">
            <i data-lucide="download" class="w-4 h-4"></i>
          </a>
        </div>
      </div>
    `).join('');
    if (window.lucide) lucide.createIcons();
  }

  function renderCoursesGrid() {
    if (!adminCoursesGrid) return;
    if (courses.length === 0) {
      adminCoursesGrid.innerHTML = `
        <div class="col-span-full p-12 text-center rounded-2xl bg-slate-900/60 border border-slate-800 text-slate-500">
          <i data-lucide="folder-x" class="w-12 h-12 mx-auto mb-3 text-slate-600"></i>
          <p class="text-sm">No courses found in database.</p>
        </div>
      `;
      if (window.lucide) lucide.createIcons();
      return;
    }

    adminCoursesGrid.innerHTML = courses.map(c => {
      const manifest = c.manifest || {};
      const modules = manifest.modules || [];
      const totalLessons = modules.reduce((acc, m) => acc + (m.lessons ? m.lessons.length : 0), 0);
      const sizeMb = (c.fileSize / (1024 * 1024)).toFixed(2);

      return `
        <div class="p-6 rounded-2xl bg-slate-900/80 border border-slate-800 shadow-xl space-y-4 hover:border-slate-700 transition-all">
          <div class="flex items-start justify-between">
            <div class="w-10 h-10 rounded-xl bg-indigo-500/10 text-indigo-400 flex items-center justify-center flex-shrink-0">
              <i data-lucide="book-open" class="w-5 h-5"></i>
            </div>
            <span class="text-[10px] font-mono bg-indigo-500/10 text-indigo-400 px-2 py-0.5 rounded-full border border-indigo-500/20">${c.id}</span>
          </div>

          <div>
            <h3 class="text-base font-bold text-white tracking-tight">${c.title}</h3>
            <p class="text-xs text-slate-400 mt-1 line-clamp-2">${c.description || 'No description provided.'}</p>
          </div>

          <div class="grid grid-cols-2 gap-2 text-xs font-mono bg-slate-950 p-3 rounded-xl border border-slate-800/80">
            <div>
              <span class="text-slate-500 text-[10px] block">CURRICULUM</span>
              <span class="text-slate-200">${modules.length} Mods • ${totalLessons} Lessons</span>
            </div>
            <div>
              <span class="text-slate-500 text-[10px] block">AES-256 FILE</span>
              <span class="text-emerald-400">${sizeMb > 0 ? sizeMb + ' MB' : (c.fileSize / 1024).toFixed(1) + ' KB'}</span>
            </div>
          </div>

          <div class="flex items-center space-x-2 pt-2 border-t border-slate-800/60">
            <button onclick="window.openCourseEditor('${c.id}')" class="flex-1 py-2 px-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium shadow-md shadow-indigo-600/20 flex items-center justify-center space-x-1.5 transition-all">
              <i data-lucide="edit-3" class="w-3.5 h-3.5"></i>
              <span>Edit Content</span>
            </button>
            <a href="/api/admin/courses/${c.id}/download" class="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors" title="Download .enc file">
              <i data-lucide="download" class="w-4 h-4"></i>
            </a>
            <button onclick="window.deleteCourse('${c.id}')" class="p-2 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20 transition-colors" title="Delete Course">
              <i data-lucide="trash-2" class="w-4 h-4"></i>
            </button>
          </div>
        </div>
      `;
    }).join('');

    if (window.lucide) lucide.createIcons();
  }

  // --- Interactive Course Curriculum Editor ---
  window.openCourseEditor = function(courseId) {
    const course = courses.find(c => c.id === courseId);
    if (!course) return;

    activeEditingCourseId = courseId;
    editorModalTitle.textContent = `Edit Content: ${course.title}`;
    editorCourseTitle.value = course.title || '';
    editorCourseDesc.value = course.description || '';

    // Clone modules
    const manifest = course.manifest || {};
    activeEditingModules = JSON.parse(JSON.stringify(manifest.modules || []));

    renderEditorModules();
    courseEditorModal.classList.remove('hidden');
    if (window.lucide) lucide.createIcons();
  };

  function renderEditorModules() {
    if (activeEditingModules.length === 0) {
      editorModulesList.innerHTML = `
        <div class="p-8 text-center bg-slate-950/40 border border-dashed border-slate-800 rounded-2xl text-slate-500 text-xs">
          No modules yet. Click "+ Add New Module" below to get started.
        </div>
      `;
      return;
    }

    editorModulesList.innerHTML = activeEditingModules.map((mod, modIdx) => `
      <div class="rounded-2xl border border-slate-800 bg-slate-950/80 p-4 space-y-3">
        <!-- Module Header -->
        <div class="flex items-center justify-between pb-2 border-b border-slate-800">
          <div class="flex items-center space-x-2 flex-1 mr-4">
            <span class="text-xs font-mono text-indigo-400 font-bold">#${modIdx + 1}</span>
            <input type="text" value="${escapeHtml(mod.moduleTitle || '')}" 
              onchange="window.updateModuleTitle(${modIdx}, this.value)"
              class="bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white font-semibold flex-1 focus:outline-none focus:ring-1 focus:ring-indigo-500" 
              placeholder="Module Title (e.g. 1. Introduction)">
          </div>
          <button type="button" onclick="window.removeModule(${modIdx})" class="text-rose-400 hover:text-rose-300 p-1 rounded-lg hover:bg-slate-900 text-xs flex items-center space-x-1">
            <i data-lucide="trash" class="w-3.5 h-3.5"></i>
            <span>Remove Module</span>
          </button>
        </div>

        <!-- Lessons in this module -->
        <div class="space-y-2">
          ${(mod.lessons || []).map((les, lesIdx) => `
            <div class="flex items-center space-x-2 bg-slate-900/60 p-2.5 rounded-xl border border-slate-800/80">
              <span class="text-[10px] text-slate-500 font-mono flex-shrink-0">${lesIdx + 1}.</span>
              
              <!-- Lesson Title -->
              <input type="text" value="${escapeHtml(les.title || '')}" 
                onchange="window.updateLessonProp(${modIdx}, ${lesIdx}, 'title', this.value)"
                class="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1 text-xs text-slate-200 flex-1 focus:outline-none focus:border-indigo-500" 
                placeholder="Lesson Title">

              <!-- Lesson Type Selector -->
              <select onchange="window.updateLessonProp(${modIdx}, ${lesIdx}, 'type', this.value)"
                class="bg-slate-950 border border-slate-800 rounded-lg px-2 py-1 text-xs text-indigo-400 font-medium focus:outline-none">
                <option value="video" ${les.type === 'video' ? 'selected' : ''}>VIDEO (.m3u8)</option>
                <option value="pdf" ${les.type === 'pdf' ? 'selected' : ''}>PDF (.pdf)</option>
                <option value="telegram" ${les.type === 'telegram' ? 'selected' : ''}>TELEGRAM</option>
                <option value="image" ${les.type === 'image' ? 'selected' : ''}>IMAGE</option>
                <option value="doc" ${les.type === 'doc' ? 'selected' : ''}>DOC/NOTES</option>
              </select>

              <!-- Lesson URL / Source -->
              <input type="text" value="${escapeHtml(les.url || '')}" 
                onchange="window.updateLessonProp(${modIdx}, ${lesIdx}, 'url', this.value)"
                class="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1 text-xs text-slate-300 font-mono flex-1 focus:outline-none focus:border-indigo-500" 
                placeholder="Stream URL, PDF link, or telegram URL">

              <!-- Remove Lesson Trash Button -->
              <button type="button" onclick="window.removeLesson(${modIdx}, ${lesIdx})" class="text-rose-400 hover:text-rose-300 p-1 flex-shrink-0" title="Remove Lesson">
                <i data-lucide="x-circle" class="w-4 h-4"></i>
              </button>
            </div>
          `).join('')}
        </div>

        <!-- Add Lesson Button -->
        <button type="button" onclick="window.addLessonToModule(${modIdx})" class="text-[11px] text-indigo-400 hover:text-indigo-300 font-medium flex items-center space-x-1 pt-1 transition-colors">
          <i data-lucide="plus-circle" class="w-3.5 h-3.5"></i>
          <span>+ Add Lesson to this Module</span>
        </button>
      </div>
    `).join('');

    if (window.lucide) lucide.createIcons();
  }

  function escapeHtml(str) {
    return (str || '').replace(/"/g, '&quot;');
  }

  window.updateModuleTitle = function(modIdx, val) {
    if (activeEditingModules[modIdx]) {
      activeEditingModules[modIdx].moduleTitle = val;
    }
  };

  window.removeModule = function(modIdx) {
    if (confirm('Delete this entire module and its lessons?')) {
      activeEditingModules.splice(modIdx, 1);
      renderEditorModules();
    }
  };

  btnEditorAddModule.addEventListener('click', () => {
    activeEditingModules.push({
      id: 'mod_' + (activeEditingModules.length + 1),
      moduleTitle: `${activeEditingModules.length + 1}. New Module`,
      lessons: []
    });
    renderEditorModules();
  });

  window.addLessonToModule = function(modIdx) {
    const mod = activeEditingModules[modIdx];
    if (!mod) return;
    if (!mod.lessons) mod.lessons = [];
    mod.lessons.push({
      id: 'les_' + Date.now().toString().slice(-4),
      title: `Lesson ${mod.lessons.length + 1}`,
      type: 'video',
      url: '',
      isStreamUrl: true
    });
    renderEditorModules();
  };

  window.removeLesson = function(modIdx, lesIdx) {
    const mod = activeEditingModules[modIdx];
    if (mod && mod.lessons) {
      mod.lessons.splice(lesIdx, 1);
      renderEditorModules();
    }
  };

  window.updateLessonProp = function(modIdx, lesIdx, prop, val) {
    const mod = activeEditingModules[modIdx];
    if (mod && mod.lessons && mod.lessons[lesIdx]) {
      mod.lessons[lesIdx][prop] = val;
      if (prop === 'url') {
        mod.lessons[lesIdx].isStreamUrl = val.startsWith('http');
      }
    }
  };

  btnCloseCourseEditor.addEventListener('click', () => courseEditorModal.classList.add('hidden'));
  btnCancelCourseEditor.addEventListener('click', () => courseEditorModal.classList.add('hidden'));

  // Save changes and re-encrypt course package
  btnSaveCourseEditor.addEventListener('click', async () => {
    if (!activeEditingCourseId) return;

    btnSaveCourseEditor.disabled = true;
    btnSaveCourseEditor.innerHTML = `
      <div class="animate-spin rounded-full h-3.5 w-3.5 border-2 border-white border-t-transparent"></div>
      <span>Re-encrypting in RAM...</span>
    `;

    try {
      const res = await fetch(`/api/admin/courses/${activeEditingCourseId}`, {
        method: 'PUT',
        headers: {
          ...getAuthHeaders(),
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          title: editorCourseTitle.value.trim(),
          description: editorCourseDesc.value.trim(),
          modules: activeEditingModules
        })
      });

      if (res.status === 401) {
        showLoginModal();
        return;
      }

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update course');

      alert(`Success! Course "${data.course.title}" has been updated and re-encrypted.\nExisting student 56-character license keys remain valid!`);
      courseEditorModal.classList.add('hidden');
      loadCourses();
    } catch (err) {
      alert('Error saving course changes: ' + err.message);
    } finally {
      btnSaveCourseEditor.disabled = false;
      btnSaveCourseEditor.innerHTML = `
        <i data-lucide="shield-check" class="w-4 h-4"></i>
        <span>Save Changes & Re-Encrypt Package</span>
      `;
      if (window.lucide) lucide.createIcons();
    }
  });

  // Delete Course
  window.deleteCourse = async function(courseId) {
    const course = courses.find(c => c.id === courseId);
    if (!confirm(`Are you sure you want to delete course "${course ? course.title : courseId}"?\nThis cannot be undone.`)) return;

    try {
      const res = await fetch(`/api/admin/courses/${courseId}`, {
        method: 'DELETE',
        headers: getAuthHeaders()
      });

      if (res.status === 401) {
        showLoginModal();
        return;
      }

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to delete');

      alert(data.message || 'Course deleted.');
      loadCourses();
    } catch (err) {
      alert('Error deleting course: ' + err.message);
    }
  };

  // -------------------------------------------------------------
  // 5. 56-CHARACTER LICENSE MANAGEMENT
  // -------------------------------------------------------------
  function updateLicenseCourseSelect() {
    if (!licCourseSelect) return;
    licCourseSelect.innerHTML = courses.map(c => `
      <option value="${c.id}">${c.title} (${c.moduleCount || 0} Modules)</option>
    `).join('');
  }

  btnOpenCreateLicense.addEventListener('click', () => {
    updateLicenseCourseSelect();
    licenseModal.classList.remove('hidden');
  });

  btnCloseLicenseModal.addEventListener('click', () => licenseModal.classList.add('hidden'));
  btnCancelLicense.addEventListener('click', () => licenseModal.classList.add('hidden'));

  ipLockRadios.forEach(radio => {
    radio.addEventListener('change', (e) => {
      if (e.target.value === 'strict') {
        strictIpContainer.classList.remove('hidden');
      } else {
        strictIpContainer.classList.add('hidden');
      }
    });
  });

  createLicenseForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const courseId = licCourseSelect.value;
    const customerName = document.getElementById('lic-student-name').value.trim();
    const customerEmail = document.getElementById('lic-student-email').value.trim();
    const ipLockMode = document.querySelector('input[name="ipLockMode"]:checked').value;
    const allowedIpv4 = document.getElementById('lic-allowed-ipv4').value.trim();
    const allowedIpv6 = document.getElementById('lic-allowed-ipv6').value.trim();

    try {
      const res = await fetch('/api/admin/licenses', {
        method: 'POST',
        headers: {
          ...getAuthHeaders(),
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          courseId,
          customerName,
          customerEmail,
          ipLockMode,
          allowedIpv4,
          allowedIpv6
        })
      });

      if (res.status === 401) {
        showLoginModal();
        return;
      }

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to create license');

      licenseModal.classList.add('hidden');
      createLicenseForm.reset();
      strictIpContainer.classList.add('hidden');
      loadLicenses();
      alert(`56-Character License Created!\nStudent: ${data.license.customerName}\nKey (${data.license.keyLength} chars): ${data.license.licenseKey}\nGive this 56-char key and the .enc file to the customer.`);
    } catch (err) {
      alert('Error creating license: ' + err.message);
    }
  });

  async function loadLicenses() {
    try {
      const res = await fetch('/api/admin/licenses', {
        headers: getAuthHeaders()
      });
      if (res.status === 401) {
        showLoginModal();
        return;
      }
      const data = await res.json();
      if (data.success) {
        licenses = data.licenses;
        renderLicenses();
      }
    } catch (err) {
      console.error('Failed to load licenses:', err);
    }
  }

  function renderLicenses() {
    licenseTotalCount.textContent = `${licenses.length} Licenses`;
    if (licenses.length === 0) {
      licensesTableBody.innerHTML = `<tr><td colspan="7" class="px-6 py-8 text-center text-slate-500 italic">No licenses generated yet.</td></tr>`;
      return;
    }

    licensesTableBody.innerHTML = licenses.map(lic => {
      const isRevoked = lic.status === 'revoked';
      const ipDisplay = lic.boundIpv4 || lic.boundIpv6
        ? `<div class="text-[11px] font-mono text-emerald-400">
             <div>${lic.boundIpv4 ? 'IPv4: ' + lic.boundIpv4 : ''}</div>
             <div>${lic.boundIpv6 ? 'IPv6: ' + lic.boundIpv6.slice(0, 16) + '...' : ''}</div>
             <span class="text-[9px] bg-emerald-500/10 px-1 py-0.5 rounded border border-emerald-500/20">Locked</span>
           </div>`
        : `<span class="text-slate-500 italic text-xs">Waiting 1st Login</span>`;

      const hwidDisplay = lic.boundHwid
        ? `<span class="text-slate-300 font-mono text-xs" title="${lic.boundHwid}">${lic.boundHwid.slice(0, 10)}...</span>`
        : `<span class="text-slate-500 italic text-xs">Unbound</span>`;

      return `
        <tr class="hover:bg-slate-800/30 transition-colors">
          <td class="px-5 py-4">
            <div class="font-medium text-white">${lic.customerName}</div>
            <div class="text-xs text-slate-500">${lic.customerEmail || 'No email'}</div>
          </td>
          <td class="px-5 py-4">
            <div class="text-xs text-slate-300 max-w-[140px] truncate" title="${lic.courseTitle}">${lic.courseTitle}</div>
          </td>
          <td class="px-5 py-4">
            <div class="flex items-center space-x-1.5">
              <span class="font-mono text-[11px] font-semibold text-indigo-300 max-w-[210px] truncate" title="${lic.licenseKey}">${lic.licenseKey}</span>
              <button onclick="copyToClipboard('${lic.licenseKey}')" class="text-slate-400 hover:text-white p-1" title="Copy 56-char key">
                <i data-lucide="copy" class="w-3.5 h-3.5"></i>
              </button>
            </div>
          </td>
          <td class="px-5 py-4">${ipDisplay}</td>
          <td class="px-5 py-4">${hwidDisplay}</td>
          <td class="px-5 py-4">
            ${isRevoked 
              ? `<span class="px-2 py-0.5 rounded-full text-[11px] font-medium bg-rose-500/10 text-rose-400 border border-rose-500/20">Revoked</span>`
              : `<span class="px-2 py-0.5 rounded-full text-[11px] font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">Active</span>`
            }
          </td>
          <td class="px-5 py-4 text-right">
            <div class="flex items-center justify-end space-x-2">
              <button onclick="resetDeviceLock('${lic.licenseKey}')" class="px-2 py-1 text-xs rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors">
                Reset
              </button>
              ${!isRevoked ? `
                <button onclick="revokeLicense('${lic.licenseKey}')" class="px-2 py-1 text-xs rounded-lg bg-rose-600/20 hover:bg-rose-600/30 text-rose-300 border border-rose-500/30 transition-colors">
                  Revoke
                </button>
              ` : ''}
            </div>
          </td>
        </tr>
      `;
    }).join('');

    if (window.lucide) lucide.createIcons();
  }

  window.copyToClipboard = function(text) {
    navigator.clipboard.writeText(text);
    alert('56-character license key copied to clipboard:\n' + text);
  };

  window.revokeLicense = async function(licenseKey) {
    if (!confirm(`Revoke license ${licenseKey}?`)) return;
    try {
      const res = await fetch(`/api/admin/licenses/${licenseKey}/revoke`, {
        method: 'POST',
        headers: getAuthHeaders()
      });
      if (res.ok) loadLicenses();
    } catch (e) {
      alert('Failed: ' + e.message);
    }
  };

  window.resetDeviceLock = async function(licenseKey) {
    if (!confirm(`Reset HWID & IPv4/IPv6 for ${licenseKey}?`)) return;
    try {
      const res = await fetch(`/api/admin/licenses/${licenseKey}/reset-device`, {
        method: 'POST',
        headers: getAuthHeaders()
      });
      if (res.ok) loadLicenses();
    } catch (e) {
      alert('Failed: ' + e.message);
    }
  };

  // -------------------------------------------------------------
  // 6. SECURITY AUDIT LOGS
  // -------------------------------------------------------------
  btnRefreshLogs.addEventListener('click', loadLogs);

  async function loadLogs() {
    try {
      const res = await fetch('/api/admin/logs', {
        headers: getAuthHeaders()
      });
      if (res.status === 401) {
        showLoginModal();
        return;
      }
      const data = await res.json();
      if (data.success) {
        renderLogs(data.logs);
      }
    } catch (err) {
      console.error('Failed to load logs:', err);
    }
  }

  function renderLogs(logs) {
    let grantedCount = 0;
    let blockedCount = 0;
    const activeHwids = new Set();

    logs.forEach(l => {
      if (l.status === 'granted') grantedCount++;
      if (l.status && l.status.startsWith('rejected')) blockedCount++;
      if (l.hwid) activeHwids.add(l.hwid);
    });

    statGranted.textContent = grantedCount;
    statBlocked.textContent = blockedCount;
    statActiveDevices.textContent = activeHwids.size;

    if (logs.length === 0) {
      logsTableBody.innerHTML = `<tr><td colspan="6" class="px-6 py-8 text-center text-slate-500 font-sans italic">No security events logged yet.</td></tr>`;
      return;
    }

    logsTableBody.innerHTML = logs.map(l => {
      let statusBadge = `<span class="text-slate-400">${l.status}</span>`;
      if (l.status === 'granted') {
        statusBadge = `<span class="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">GRANTED</span>`;
      } else if (l.status && l.status.startsWith('rejected')) {
        statusBadge = `<span class="px-2 py-0.5 rounded bg-rose-500/10 text-rose-400 border border-rose-500/20">BLOCKED</span>`;
      }

      const timeStr = new Date(l.timestamp).toLocaleTimeString();

      return `
        <tr class="hover:bg-slate-800/30">
          <td class="px-5 py-3 text-slate-400">${timeStr}</td>
          <td class="px-5 py-3 text-slate-300">${l.action}</td>
          <td class="px-5 py-3 text-indigo-300 font-mono text-[11px] truncate max-w-[120px]">${l.studentName || l.licenseKey || '-'}</td>
          <td class="px-5 py-3 text-slate-300 font-mono text-[11px]">${l.ip || '-'}</td>
          <td class="px-5 py-3">${statusBadge}</td>
          <td class="px-5 py-3 text-slate-400 font-sans text-xs">${l.message}</td>
        </tr>
      `;
    }).join('');
  }

  // -------------------------------------------------------------
  // 7. ADMIN SECURITY & 2FA SETTINGS TAB
  // -------------------------------------------------------------
  async function loadAdminSecurityInfo() {
    try {
      const res = await fetch('/api/admin/auth/setup-info');
      const data = await res.json();
      if (data.success) {
        settingLoginId.value = data.loginId;
        settingsQrCode.src = data.qrCodeDataUrl;
        settingsSecretKey.textContent = data.secret;
        candidateTotpSecret = null;
        containerVerifyNewKey.classList.add('hidden');
      }
    } catch (err) {
      console.error('Error loading admin security info:', err);
    }
  }

  btnCopySecret.addEventListener('click', () => {
    const text = settingsSecretKey.textContent;
    navigator.clipboard.writeText(text);
    alert('Authenticator secret key copied to clipboard:\n' + text);
  });

  // Generate new secret for re-pairing
  btnRegenSecret.addEventListener('click', async () => {
    if (!confirm('Generate a new Authenticator secret key?\nYou will need to scan the new QR code and enter a 6-digit confirmation code.')) return;

    try {
      const res = await fetch('/api/admin/auth/generate-new-secret', {
        headers: getAuthHeaders()
      });
      if (res.status === 401) {
        showLoginModal();
        return;
      }
      const data = await res.json();
      if (data.success) {
        candidateTotpSecret = data.secret;
        settingsQrCode.src = data.qrCodeDataUrl;
        settingsSecretKey.textContent = data.secret;
        containerVerifyNewKey.classList.remove('hidden');
        settingTotpVerify.value = '';
        settingTotpVerify.focus();
        alert('New QR code generated! Scan it in your Authenticator app and enter the 6-digit code to verify before saving.');
      }
    } catch (err) {
      alert('Error generating new secret: ' + err.message);
    }
  });

  // Save admin security settings (Login ID, Password, 2FA)
  btnSaveAdminSecurity.addEventListener('click', async () => {
    const newLoginId = settingLoginId.value.trim();
    const currentPassword = settingCurrentPass.value;
    const newPassword = settingNewPass.value;
    const confirmPassword = settingConfirmPass.value;
    const totpVerificationCode = settingTotpVerify.value.trim();

    if (!currentPassword) {
      alert('Please enter your Current Password to save security changes.');
      settingCurrentPass.focus();
      return;
    }

    if (newPassword && newPassword !== confirmPassword) {
      alert('New password and confirm password do not match.');
      settingConfirmPass.focus();
      return;
    }

    if (candidateTotpSecret && !totpVerificationCode) {
      alert('Please enter the 6-digit code from your authenticator app to verify the new key.');
      settingTotpVerify.focus();
      return;
    }

    btnSaveAdminSecurity.disabled = true;

    try {
      const res = await fetch('/api/admin/auth/update-credentials', {
        method: 'POST',
        headers: {
          ...getAuthHeaders(),
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          newLoginId,
          currentPassword,
          newPassword: newPassword || undefined,
          newTotpSecret: candidateTotpSecret || undefined,
          totpVerificationCode: totpVerificationCode || undefined
        })
      });

      if (res.status === 401) {
        showLoginModal();
        return;
      }

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update security credentials');

      adminUsernameDisplay.textContent = data.loginId;
      settingCurrentPass.value = '';
      settingNewPass.value = '';
      settingConfirmPass.value = '';
      candidateTotpSecret = null;
      containerVerifyNewKey.classList.add('hidden');

      securitySaveFeedback.classList.remove('hidden');
      setTimeout(() => securitySaveFeedback.classList.add('hidden'), 5000);
      alert('Security credentials updated successfully!');
    } catch (err) {
      alert('Error updating credentials: ' + err.message);
    } finally {
      btnSaveAdminSecurity.disabled = false;
    }
  });

  // Initial Auth Check
  checkAuthStatus().then(authed => {
    if (authed) {
      loadCourses();
      loadLicenses();
      loadLogs();
      loadAdminSecurityInfo();
    }
  });
});
