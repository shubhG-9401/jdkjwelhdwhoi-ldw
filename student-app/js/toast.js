/**
 * Student App Non-blocking Toast Notification Engine
 */

export class StudentToast {
  static container = null;

  static ensureContainer() {
    if (!this.container) {
      this.container = document.createElement('div');
      this.container.id = 'student-toast-container';
      this.container.className = 'fixed top-14 right-6 z-[9999] flex flex-col space-y-2 pointer-events-none max-w-sm w-full';
      document.body.appendChild(this.container);
    }
  }

  static show({ title = 'Lesson Completed!', message = 'Watched 75% (3/4) of video', type = 'success', duration = 4000 } = {}) {
    this.ensureContainer();

    const toast = document.createElement('div');
    toast.className = 'pointer-events-auto transform transition-all duration-300 ease-out translate-y-[-10px] opacity-0 flex items-start space-x-3.5 p-4 rounded-xl shadow-2xl border text-xs font-sans select-none ' +
      (type === 'success'
        ? 'bg-[#1c2026]/95 border-emerald-500/40 text-slate-100 shadow-emerald-950/40'
        : 'bg-[#1c2026]/95 border-slate-700 text-slate-100 shadow-black/50');

    const iconHtml = (type === 'success')
      ? `<div class="w-8 h-8 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center flex-shrink-0">
           <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
             <polyline points="20 6 9 17 4 12"></polyline>
           </svg>
         </div>`
      : `<div class="w-8 h-8 rounded-lg bg-indigo-500/20 text-indigo-400 flex items-center justify-center flex-shrink-0">
           <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
             <circle cx="12" cy="12" r="10"></circle>
             <line x1="12" y1="16" x2="12" y2="12"></line>
             <line x1="12" y1="8" x2="12.01" y2="8"></line>
           </svg>
         </div>`;

    toast.innerHTML = `
      ${iconHtml}
      <div class="flex-1 min-w-0">
        <div class="text-[13px] font-semibold text-white tracking-tight leading-snug">${title}</div>
        <div class="text-[11.5px] text-[#9ca3af] mt-0.5 leading-tight">${message}</div>
      </div>
      <button class="text-[#888e99] hover:text-white flex-shrink-0 text-base leading-none px-1">&times;</button>
    `;

    toast.querySelector('button').addEventListener('click', () => {
      this.dismiss(toast);
    });

    this.container.appendChild(toast);

    requestAnimationFrame(() => {
      toast.classList.remove('translate-y-[-10px]', 'opacity-0');
      toast.classList.add('translate-y-0', 'opacity-100');
    });

    if (duration > 0) {
      setTimeout(() => this.dismiss(toast), duration);
    }
  }

  static dismiss(toast) {
    if (!toast) return;
    toast.classList.add('opacity-0', 'translate-y-[-10px]');
    setTimeout(() => {
      try {
        toast.remove();
      } catch {}
    }, 320);
  }
}
