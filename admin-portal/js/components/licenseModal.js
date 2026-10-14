import { licenseService } from '../services/licenseService.js';
import { courseService } from '../services/courseService.js';
import { adminStore } from '../state.js';
import { Toast } from '../toast.js';

/**
 * 56-Character License Creation Modal Component
 */
export class LicenseModalComponent {
  constructor() {
    this.modal = document.getElementById('license-modal');
    this.form = document.getElementById('create-license-form');
    this.btnOpen = document.getElementById('btn-open-create-license');
    this.btnClose = document.getElementById('btn-close-license-modal');
    this.btnCancel = document.getElementById('btn-cancel-license');
    this.courseSelect = document.getElementById('lic-course-select');
    this.strictIpContainer = document.getElementById('strict-ip-container');
    this.ipLockRadios = document.querySelectorAll('input[name="ipLockMode"]');

    this.bindEvents();
    this.subscribeState();
  }

  bindEvents() {
    if (this.btnOpen) {
      this.btnOpen.addEventListener('click', async () => {
        const courses = adminStore.getState().courses;
        if (!courses || courses.length === 0) {
          await courseService.loadCourses();
        }
        this.updateCourseSelect();
        this.open();
      });
    }

    if (this.btnClose) this.btnClose.addEventListener('click', () => this.close());
    if (this.btnCancel) this.btnCancel.addEventListener('click', () => this.close());

    this.ipLockRadios.forEach(radio => {
      radio.addEventListener('change', (e) => {
        if (e.target.value === 'strict') {
          this.strictIpContainer?.classList.remove('hidden');
        } else {
          this.strictIpContainer?.classList.add('hidden');
        }
      });
    });

    if (this.form) {
      this.form.addEventListener('submit', (e) => this.handleSubmit(e));
    }
  }

  subscribeState() {
    adminStore.subscribe('courses', () => this.updateCourseSelect());
  }

  open() {
    this.updateCourseSelect();
    if (this.modal) {
      this.modal.classList.remove('hidden');
      this.modal.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    const nameInput = document.getElementById('lic-student-name') || document.getElementById('lic-customer-name');
    if (nameInput) nameInput.focus();
    if (window.lucide) lucide.createIcons();
  }

  close() {
    if (this.modal) this.modal.classList.add('hidden');
    if (this.form) this.form.reset();
    if (this.strictIpContainer) this.strictIpContainer.classList.add('hidden');
  }

  updateCourseSelect() {
    if (!this.courseSelect) return;
    const courses = adminStore.getState().courses;
    if (!courses || courses.length === 0) {
      this.courseSelect.innerHTML = '<option value="">-- No Courses Available --</option>';
      return;
    }
    this.courseSelect.innerHTML = courses.map(c => `
      <option value="${c.id}">${c.title} (${c.moduleCount || 0} Modules)</option>
    `).join('');
    if (!this.courseSelect.value && courses.length > 0) {
      this.courseSelect.value = courses[0].id;
    }
  }

  async handleSubmit(e) {
    e.preventDefault();

    const courseId = this.courseSelect?.value;
    const nameEl = document.getElementById('lic-student-name') || document.getElementById('lic-customer-name');
    const emailEl = document.getElementById('lic-student-email') || document.getElementById('lic-customer-email');
    const ipLockRadio = document.querySelector('input[name="ipLockMode"]:checked');
    const ipv4El = document.getElementById('lic-allowed-ipv4') || document.getElementById('lic-strict-ipv4');
    const ipv6El = document.getElementById('lic-allowed-ipv6') || document.getElementById('lic-strict-ipv6');

    const customerName = nameEl ? nameEl.value.trim() : '';
    const customerEmail = emailEl ? emailEl.value.trim() : '';
    const ipLockMode = ipLockRadio ? ipLockRadio.value : 'first_login';
    const allowedIpv4 = ipv4El ? ipv4El.value.trim() : '';
    const allowedIpv6 = ipv6El ? ipv6El.value.trim() : '';

    if (!courseId) {
      Toast.error('Please select a course for this license.');
      return;
    }
    if (!customerName) {
      Toast.error('Please enter a student name.');
      return;
    }

    const submitBtn = this.form.querySelector('button[type="submit"]');
    const originalBtnHtml = submitBtn ? submitBtn.innerHTML : '';
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.innerHTML = `
        <div class="animate-spin rounded-full h-3.5 w-3.5 border-2 border-white border-t-transparent mr-1.5 inline-block"></div>
        <span>Generating 56-Char Key...</span>
      `;
    }

    try {
      const data = await licenseService.createLicense({
        courseId,
        customerName,
        customerEmail,
        ipLockMode,
        allowedIpv4,
        allowedIpv6
      });

      this.close();

      const licKey = data.license.licenseKey;
      if (navigator.clipboard) {
        navigator.clipboard.writeText(licKey).catch(() => {});
      }

      Toast.success(`56-Character License Issued!\nStudent: ${data.license.customerName}\nKey: ${licKey}\n(Copied to clipboard)`, 8000);
    } catch (err) {
      Toast.error('Failed to create license: ' + err.message);
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.innerHTML = originalBtnHtml;
        if (window.lucide) lucide.createIcons();
      }
    }
  }
}
