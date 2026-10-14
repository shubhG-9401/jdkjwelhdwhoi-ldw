/**
 * Table and Grid Renderers for Admin Portal
 */

export function renderCoursesList(courses, container) {
  if (!container) return;
  if (!courses || courses.length === 0) {
    container.innerHTML = `<div class="p-6 text-center text-slate-500 italic text-xs">No courses encrypted yet.</div>`;
    return;
  }

  container.innerHTML = courses.map(c => `
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

export function renderCoursesGrid(courses, container) {
  if (!container) return;
  if (!courses || courses.length === 0) {
    container.innerHTML = `
      <div class="col-span-full p-12 text-center rounded-2xl bg-slate-900/60 border border-slate-800 text-slate-500">
        <i data-lucide="folder-x" class="w-12 h-12 mx-auto mb-3 text-slate-600"></i>
        <p class="text-sm">No courses found in database.</p>
      </div>
    `;
    if (window.lucide) lucide.createIcons();
    return;
  }

  container.innerHTML = courses.map(c => {
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

export function renderLicensesTable(licenses, container, countEl) {
  if (countEl) countEl.textContent = `${licenses.length} Licenses`;
  if (!container) return;

  if (!licenses || licenses.length === 0) {
    container.innerHTML = `<tr><td colspan="7" class="px-6 py-8 text-center text-slate-500 italic">No licenses generated yet.</td></tr>`;
    return;
  }

  container.innerHTML = licenses.map(lic => {
    const isRevoked = lic.status === 'revoked';
    const hasBoundIp = Boolean(lic.boundIpv4 || lic.boundIpv6);
    const hasAllowedIp = Boolean(lic.allowedIpv4 || lic.allowedIpv6);

    let ipDisplay = '';
    if (hasBoundIp) {
      ipDisplay = `
        <div class="text-[11px] font-mono space-y-1">
          ${lic.boundIpv4 ? `
            <div class="flex items-center space-x-1.5">
              <span class="text-[9px] uppercase px-1 py-0.5 rounded bg-slate-800 text-slate-400 font-sans font-semibold">IPv4</span>
              <span class="text-emerald-400 font-medium select-all">${lic.boundIpv4}</span>
            </div>` : ''}
          ${lic.boundIpv6 ? `
            <div class="flex items-start space-x-1.5">
              <span class="text-[9px] uppercase px-1 py-0.5 rounded bg-slate-800 text-slate-400 font-sans font-semibold mt-0.5">IPv6</span>
              <div class="flex items-center space-x-1">
                <span class="text-emerald-300 font-semibold break-all select-all max-w-[200px]" title="${lic.boundIpv6}">${lic.boundIpv6}</span>
                <button onclick="window.copyToClipboard('${lic.boundIpv6}')" class="text-slate-500 hover:text-white p-0.5 flex-shrink-0" title="Copy IPv6">
                  <i data-lucide="copy" class="w-3 h-3"></i>
                </button>
              </div>
            </div>` : ''}
          <div class="pt-0.5">
            <span class="inline-flex items-center space-x-1 text-[9px] bg-emerald-500/10 text-emerald-400 px-1.5 py-0.5 rounded border border-emerald-500/20 font-sans font-medium">
              <i data-lucide="shield-check" class="w-2.5 h-2.5"></i>
              <span>Locked to Device & IP</span>
            </span>
          </div>
        </div>
      `;
    } else if (hasAllowedIp) {
      ipDisplay = `
        <div class="text-[11px] font-mono space-y-1">
          ${lic.allowedIpv4 ? `
            <div class="flex items-center space-x-1.5">
              <span class="text-[9px] uppercase px-1 py-0.5 rounded bg-slate-800 text-slate-400 font-sans font-semibold">Pre-IPv4</span>
              <span class="text-indigo-300 font-medium select-all">${lic.allowedIpv4}</span>
            </div>` : ''}
          ${lic.allowedIpv6 ? `
            <div class="flex items-start space-x-1.5">
              <span class="text-[9px] uppercase px-1 py-0.5 rounded bg-slate-800 text-slate-400 font-sans font-semibold mt-0.5">Pre-IPv6</span>
              <div class="flex items-center space-x-1">
                <span class="text-indigo-200 font-semibold break-all select-all max-w-[200px]" title="${lic.allowedIpv6}">${lic.allowedIpv6}</span>
                <button onclick="window.copyToClipboard('${lic.allowedIpv6}')" class="text-slate-500 hover:text-white p-0.5 flex-shrink-0" title="Copy Pre-configured IPv6">
                  <i data-lucide="copy" class="w-3 h-3"></i>
                </button>
              </div>
            </div>` : ''}
          <div class="pt-0.5">
            <span class="inline-flex items-center space-x-1 text-[9px] bg-indigo-500/10 text-indigo-400 px-1.5 py-0.5 rounded border border-indigo-500/20 font-sans font-medium">
              <i data-lucide="lock" class="w-2.5 h-2.5"></i>
              <span>Strict Pre-Configured</span>
            </span>
          </div>
        </div>
      `;
    } else {
      ipDisplay = `
        <div class="space-y-1 font-sans">
          <div class="text-xs text-amber-400/90 font-medium flex items-center space-x-1">
            <i data-lucide="clock" class="w-3.5 h-3.5 text-amber-400"></i>
            <span>Waiting 1st Login</span>
          </div>
          <div class="text-[10px] text-slate-500">Auto-locks IPv4 & IPv6 on first student launch</div>
        </div>
      `;
    }

    const hwidDisplay = lic.boundHwid
      ? `<div class="font-mono text-xs text-slate-200 select-all" title="${lic.boundHwid}">${lic.boundHwid}</div>`
      : `<span class="text-slate-500 italic text-xs">Unbound (Any PC on 1st login)</span>`;

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
            <button onclick="window.copyToClipboard('${lic.licenseKey}')" class="text-slate-400 hover:text-white p-1" title="Copy 56-char key">
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
            <button onclick="window.resetDeviceLock('${lic.licenseKey}')" class="px-2 py-1 text-xs rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors">
              Reset
            </button>
            ${!isRevoked ? `
              <button onclick="window.revokeLicense('${lic.licenseKey}')" class="px-2 py-1 text-xs rounded-lg bg-rose-600/20 hover:bg-rose-600/30 text-rose-300 border border-rose-500/30 transition-colors">
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

export function renderLogsTable(logs, container) {
  if (!container) return;
  if (!logs || logs.length === 0) {
    container.innerHTML = `<tr><td colspan="5" class="px-6 py-8 text-center text-slate-500 italic">No security events recorded.</td></tr>`;
    return;
  }

  container.innerHTML = logs.map(log => {
    let statusBadge = '<span class="px-2 py-0.5 rounded-full text-[10px] bg-slate-800 text-slate-400">INFO</span>';
    if (log.status === 'granted') {
      statusBadge = '<span class="px-2 py-0.5 rounded-full text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">SUCCESS</span>';
    } else if (log.status?.startsWith('rejected')) {
      statusBadge = '<span class="px-2 py-0.5 rounded-full text-[10px] bg-rose-500/10 text-rose-400 border border-rose-500/20 font-bold">BLOCKED</span>';
    }

    const timeStr = new Date(log.timestamp).toLocaleString();
    return `
      <tr class="hover:bg-slate-800/30 transition-colors text-xs font-mono">
        <td class="px-5 py-3 text-slate-400 whitespace-nowrap">${timeStr}</td>
        <td class="px-5 py-3 text-indigo-300 font-semibold uppercase">${log.action}</td>
        <td class="px-5 py-3">${statusBadge}</td>
        <td class="px-5 py-3 text-slate-400 max-w-xs truncate" title="${log.ip || '-'}">${log.ip || '-'}</td>
        <td class="px-5 py-3 text-slate-300 max-w-md truncate font-sans" title="${log.message}">${log.message}</td>
      </tr>
    `;
  }).join('');
}
