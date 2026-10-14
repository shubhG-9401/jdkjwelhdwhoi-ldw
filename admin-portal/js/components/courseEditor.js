import { courseService } from '../services/courseService.js';
import { adminStore } from '../state.js';
import { Toast } from '../toast.js';

/**
 * Course Curriculum Editor Modal Component
 */
export class CourseEditorComponent {
  constructor() {
    this.modal = document.getElementById('course-editor-modal');
    this.modalTitle = document.getElementById('editor-modal-title');
    this.courseTitleInput = document.getElementById('editor-course-title');
    this.courseDescInput = document.getElementById('editor-course-desc');
    this.modulesList = document.getElementById('editor-modules-list');
    this.btnAddModule = document.getElementById('btn-editor-add-module');
    this.btnSave = document.getElementById('btn-save-course-editor');
    this.btnClose = document.getElementById('btn-close-course-editor');
    this.btnCancel = document.getElementById('btn-cancel-course-editor');

    this.activeCourseId = null;
    this.activeModules = [];

    this.bindEvents();
    this.exposeGlobalHelpers();
  }

  bindEvents() {
    if (this.btnClose) this.btnClose.addEventListener('click', () => this.close());
    if (this.btnCancel) this.btnCancel.addEventListener('click', () => this.close());

    if (this.btnAddModule) {
      this.btnAddModule.addEventListener('click', () => {
        this.activeModules.push({
          id: 'mod_' + (this.activeModules.length + 1),
          moduleTitle: `${this.activeModules.length + 1}. New Module`,
          lessons: []
        });
        this.renderModules();
      });
    }

    if (this.btnSave) {
      this.btnSave.addEventListener('click', () => this.save());
    }
  }

  exposeGlobalHelpers() {
    window.openCourseEditor = (courseId) => this.open(courseId);
    window.updateModuleTitle = (modIdx, val) => {
      if (this.activeModules[modIdx]) this.activeModules[modIdx].moduleTitle = val;
    };
    window.removeModule = (modIdx) => {
      if (confirm('Delete this entire module and its lessons?')) {
        this.activeModules.splice(modIdx, 1);
        this.renderModules();
      }
    };
    window.addLessonToModule = (modIdx) => {
      if (!this.activeModules[modIdx]) return;
      if (!this.activeModules[modIdx].lessons) this.activeModules[modIdx].lessons = [];
      const len = this.activeModules[modIdx].lessons.length + 1;
      this.activeModules[modIdx].lessons.push({
        id: `les_${modIdx + 1}_${len}`,
        title: `Lesson ${len}`,
        type: 'video',
        url: '',
        isStreamUrl: true
      });
      this.renderModules();
    };
    window.updateLessonProp = (modIdx, lesIdx, prop, val) => {
      if (this.activeModules[modIdx]?.lessons?.[lesIdx]) {
        this.activeModules[modIdx].lessons[lesIdx][prop] = val;
      }
    };
    window.removeLesson = (modIdx, lesIdx) => {
      if (this.activeModules[modIdx]?.lessons) {
        this.activeModules[modIdx].lessons.splice(lesIdx, 1);
        this.renderModules();
      }
    };
  }

  open(courseId) {
    const courses = adminStore.getState().courses;
    const course = courses.find(c => c.id === courseId);
    if (!course) return;

    this.activeCourseId = courseId;
    if (this.modalTitle) this.modalTitle.textContent = `Edit Content: ${course.title}`;
    if (this.courseTitleInput) this.courseTitleInput.value = course.title || '';
    if (this.courseDescInput) this.courseDescInput.value = course.description || '';

    const manifest = course.manifest || {};
    this.activeModules = JSON.parse(JSON.stringify(manifest.modules || []));

    this.renderModules();
    if (this.modal) this.modal.classList.remove('hidden');
    if (window.lucide) lucide.createIcons();
  }

  close() {
    if (this.modal) this.modal.classList.add('hidden');
    this.activeCourseId = null;
    this.activeModules = [];
  }

  renderModules() {
    if (!this.modulesList) return;
    if (this.activeModules.length === 0) {
      this.modulesList.innerHTML = `
        <div class="p-8 text-center bg-slate-950/40 border border-dashed border-slate-800 rounded-2xl text-slate-500 text-xs">
          No modules yet. Click "+ Add New Module" below to get started.
        </div>
      `;
      return;
    }

    const escape = (str) => (str || '').replace(/"/g, '&quot;');

    this.modulesList.innerHTML = this.activeModules.map((mod, modIdx) => `
      <div class="rounded-2xl border border-slate-800 bg-slate-950/80 p-4 space-y-3">
        <div class="flex items-center justify-between pb-2 border-b border-slate-800">
          <div class="flex items-center space-x-2 flex-1 mr-4">
            <span class="text-xs font-mono text-indigo-400 font-bold">#${modIdx + 1}</span>
            <input type="text" value="${escape(mod.moduleTitle || '')}" 
              onchange="window.updateModuleTitle(${modIdx}, this.value)"
              class="bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white font-semibold flex-1 focus:outline-none focus:ring-1 focus:ring-indigo-500" 
              placeholder="Module Title (e.g. 1. Introduction)">
          </div>
          <button type="button" onclick="window.removeModule(${modIdx})" class="text-rose-400 hover:text-rose-300 p-1 rounded-lg hover:bg-slate-900 text-xs flex items-center space-x-1">
            <i data-lucide="trash" class="w-3.5 h-3.5"></i>
            <span>Remove Module</span>
          </button>
        </div>

        <div class="space-y-2">
          ${(mod.lessons || []).map((les, lesIdx) => `
            <div class="flex items-center space-x-2 bg-slate-900/60 p-2.5 rounded-xl border border-slate-800/80">
              <span class="text-[10px] text-slate-500 font-mono flex-shrink-0">${lesIdx + 1}.</span>
              
              <input type="text" value="${escape(les.title || '')}" 
                onchange="window.updateLessonProp(${modIdx}, ${lesIdx}, 'title', this.value)"
                class="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1 text-xs text-slate-200 flex-1 focus:outline-none focus:border-indigo-500" 
                placeholder="Lesson Title">

              <select onchange="window.updateLessonProp(${modIdx}, ${lesIdx}, 'type', this.value)"
                class="bg-slate-950 border border-slate-800 rounded-lg px-2 py-1 text-xs text-indigo-400 font-medium focus:outline-none">
                <option value="video" ${les.type === 'video' ? 'selected' : ''}>VIDEO (.m3u8)</option>
                <option value="pdf" ${les.type === 'pdf' ? 'selected' : ''}>PDF (.pdf)</option>
                <option value="telegram" ${les.type === 'telegram' ? 'selected' : ''}>TELEGRAM</option>
                <option value="image" ${les.type === 'image' ? 'selected' : ''}>IMAGE</option>
                <option value="doc" ${les.type === 'doc' ? 'selected' : ''}>DOC/NOTES</option>
              </select>

              <input type="text" value="${escape(les.url || '')}" 
                onchange="window.updateLessonProp(${modIdx}, ${lesIdx}, 'url', this.value)"
                class="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1 text-xs text-slate-300 font-mono flex-1 focus:outline-none focus:border-indigo-500" 
                placeholder="Stream URL, PDF link, or telegram URL">

              <button type="button" onclick="window.removeLesson(${modIdx}, ${lesIdx})" class="text-rose-400 hover:text-rose-300 p-1 flex-shrink-0" title="Remove Lesson">
                <i data-lucide="x-circle" class="w-4 h-4"></i>
              </button>
            </div>
          `).join('')}
        </div>

        <button type="button" onclick="window.addLessonToModule(${modIdx})" class="text-[11px] text-indigo-400 hover:text-indigo-300 font-medium flex items-center space-x-1 pt-1 transition-colors">
          <i data-lucide="plus-circle" class="w-3.5 h-3.5"></i>
          <span>+ Add Lesson to this Module</span>
        </button>
      </div>
    `).join('');

    if (window.lucide) lucide.createIcons();
  }

  async save() {
    if (!this.activeCourseId) return;

    if (this.btnSave) {
      this.btnSave.disabled = true;
      this.btnSave.innerHTML = `
        <div class="animate-spin rounded-full h-3.5 w-3.5 border-2 border-white border-t-transparent mr-1.5 inline-block"></div>
        <span>Re-encrypting Course...</span>
      `;
    }

    try {
      const data = await courseService.updateCourse(this.activeCourseId, {
        title: this.courseTitleInput?.value.trim(),
        description: this.courseDescInput?.value.trim(),
        modules: this.activeModules
      });

      Toast.success(`Course "${data.course.title}" updated and re-encrypted!\nExisting student 56-char license keys remain valid.`);
      this.close();
    } catch (err) {
      Toast.error('Error saving course changes: ' + err.message);
    } finally {
      if (this.btnSave) {
        this.btnSave.disabled = false;
        this.btnSave.innerHTML = `
          <i data-lucide="save" class="w-4 h-4"></i>
          <span>Save & Re-Encrypt Course</span>
        `;
        if (window.lucide) lucide.createIcons();
      }
    }
  }
}
