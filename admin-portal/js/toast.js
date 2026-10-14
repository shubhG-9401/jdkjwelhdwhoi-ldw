/**
 * Non-blocking, beautiful Toast Notifications for Admin Portal
 */

export class Toast {
  static container = null;

  static ensureContainer() {
    if (!this.container) {
      this.container = document.createElement('div');
      this.container.id = 'toast-container';
      this.container.className = 'fixed bottom-5 right-5 z-[9999] flex flex-col space-y-2 pointer-events-none max-w-md w-full px-4';
      document.body.appendChild(this.container);
    }
  }

  static show(message, type = 'info', duration = 4000) {
    this.ensureContainer();

    const toast = document.createElement('div');
    toast.className = `pointer-events-auto transform transition-all duration-300 ease-out translate-y-4 opacity-0 flex items-start space-x-3 p-4 rounded-xl shadow-2xl border text-xs font-medium ${
      type === 'success'
        ? 'bg-slate-900 border-emerald-500/40 text-emerald-300 shadow-emerald-950/30'
        : type === 'error'
        ? 'bg-slate-900 border-rose-500/40 text-rose-300 shadow-rose-950/30'
        : type === 'warning'
        ? 'bg-slate-900 border-amber-500/40 text-amber-300 shadow-amber-950/30'
        : 'bg-slate-900 border-indigo-500/40 text-indigo-300 shadow-indigo-950/30'
    }`;

    const icon = type === 'success' ? 'check-circle-2' : type === 'error' ? 'alert-triangle' : 'info';
    toast.innerHTML = `
      <i data-lucide="${icon}" class="w-4 h-4 flex-shrink-0 mt-0.5"></i>
      <div class="flex-1 whitespace-pre-wrap">${message}</div>
      <button class="text-slate-400 hover:text-white flex-shrink-0">&times;</button>
    `;

    toast.querySelector('button').addEventListener('click', () => {
      this.dismiss(toast);
    });

    this.container.appendChild(toast);
    if (window.lucide) lucide.createIcons();

    // Animate in
    requestAnimationFrame(() => {
      toast.classList.remove('translate-y-4', 'opacity-0');
    });

    // Auto dismiss
    if (duration > 0) {
      setTimeout(() => this.dismiss(toast), duration);
    }
  }

  static success(msg, duration) {
    this.show(msg, 'success', duration);
  }

  static error(msg, duration = 6000) {
    this.show(msg, 'error', duration);
  }

  static info(msg, duration) {
    this.show(msg, 'info', duration);
  }

  static dismiss(toast) {
    toast.classList.add('opacity-0', 'translate-y-2');
    setTimeout(() => {
      toast.remove();
    }, 300);
  }
}
