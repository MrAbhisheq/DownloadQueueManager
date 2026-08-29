/* ═══════════════════════════════════════════════════════════
   Download Manager Pro — Popup Script
   Brand name, suffix, and all display text pulled from
   _locales/en/messages.json via chrome.i18n.getMessage()
   ═══════════════════════════════════════════════════════════ */

const BC = globalThis.BrowserCompat;

// ── i18n helper ────────────────────────────────────────────
// Safe wrapper: returns message or fallback if i18n unavailable
function i18n(key, fallback = '') {
  try {
    const msg = chrome.i18n.getMessage(key);
    return msg || fallback;
  } catch {
    return fallback;
  }
}

// ── State ──────────────────────────────────────────────────
let state = {
  downloads: [], settings: {}, triggers: {},
  retryCount: {}, queuedDownloads: [], browser: {}
};
let refreshTimer = null;
let modalDownloadId = null;
let prevBytes = {};
let prevTime  = {};
let maxConcurrent = 3;

const $ = s => document.querySelector(s);
const $$ = s => document.querySelectorAll(s);

// ── Init ───────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  BC.connectKeepAlive();

  applyBranding();
  initTabs();
  initSettingsUI();
  initModal();
  initFilterBar();
  initStepper();

  await refresh();
  await detectBrowserUI();

  refreshTimer = setInterval(refresh, 1200);
});

window.addEventListener('beforeunload', () => {
  BC.disconnectKeepAlive();
  if (refreshTimer) clearInterval(refreshTimer);
});

// ── Branding ───────────────────────────────────────────────
// Reads extBaseName and extSuffix from messages.json
// and renders them into the popup header with styling.
function applyBranding() {
  const baseName = i18n('extBaseName', 'Download Manager');
  const suffix   = i18n('extSuffix',   '');
  const fullName = i18n('extName',     'Download Manager Pro');

  // ── Header ──
  const nameEl   = $('#brand-name');
  const suffixEl = $('#brand-suffix');

  if (nameEl) nameEl.textContent = baseName;

  if (suffixEl) {
    if (suffix && suffix.trim().length > 0) {
      suffixEl.textContent = suffix.trim();
      suffixEl.classList.remove('hidden');

      // Optional: auto-pick a color variant based on suffix text
      // You can also hardcode data-variant in messages.json or here
      const variantMap = {
        'pro':      'blue',
        'plus':     'green',
        'max':      'purple',
        'ultra':    'gradient',
        'lite':     'teal',
        'free':     'dark',
        'premium':  'orange',
        'beta':     'pink',
        'dev':      'red',
        'alpha':    'outline'
      };
      const variant = variantMap[suffix.trim().toLowerCase()] || 'blue';
      suffixEl.setAttribute('data-variant', variant);
    } else {
      // No suffix — hide the badge entirely
      suffixEl.classList.add('hidden');
    }
  }

  // ── Page title ──
  document.title = fullName;

  // ── Settings info card ──
  const infoEl = $('#info-ext-name');
  if (infoEl) infoEl.textContent = fullName;

  // ── Version ──
  const verEl = $('#info-version');
  if (verEl) {
    try {
      const manifest = chrome.runtime.getManifest();
      verEl.textContent = manifest.version || '1.0.0';
    } catch {
      verEl.textContent = '1.0.0';
    }
  }
}

// ── Browser badge ──────────────────────────────────────────
async function detectBrowserUI() {
  try {
    const info = await msg({ type: 'getBrowserInfo' });
    const badge = $('#browser-badge');
    badge.textContent = info.displayName || 'Browser';
    $('#info-browser').textContent = info.displayName || 'Unknown';

    if (info.browser === 'brave') {
      $('#notif-warning').classList.remove('hidden');
    }
  } catch {
    $('#browser-badge').textContent = BC.getBrowserDisplayName();
    $('#info-browser').textContent = BC.getBrowserDisplayName();
  }
}

// ── Messaging ──────────────────────────────────────────────
function msg(data) {
  return new Promise((resolve, reject) => {
    try {
      chrome.runtime.sendMessage(data, r => {
        if (chrome.runtime.lastError) return reject(chrome.runtime.lastError);
        if (r?.error) return reject(new Error(r.error));
        resolve(r);
      });
    } catch (e) {
      reject(e);
    }
  });
}

// ── Tabs ───────────────────────────────────────────────────
function initTabs() {
  $$('.tab').forEach(btn => {
    btn.addEventListener('click', () => {
      $$('.tab').forEach(b => b.classList.remove('active'));
      $$('.panel').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      $(`#panel-${btn.dataset.tab}`).classList.add('active');
    });
  });
}

// ── Data refresh ───────────────────────────────────────────
async function refresh() {
  try {
    state = await msg({ type: 'getData' });
    maxConcurrent = state.settings?.maxConcurrentDownloads || 3;
    renderDownloads();
    renderQueue();
    syncSettingsUI();
  } catch (e) {
    console.warn('[DLM Popup] refresh error:', e);
  }
}

// ── Render downloads ───────────────────────────────────────
function renderDownloads() {
  const list  = $('#downloads-list');
  const empty = $('#empty-state');
  const filter = $('#filter-status').value;

  let items = state.downloads || [];

  if (filter === 'in_progress') {
    items = items.filter(d => d.state === 'in_progress');
  } else if (filter !== 'all') {
    items = items.filter(d => d.state === filter);
  }

  if (filter === 'all') {
    const cutoff = Date.now() - 86400000;
    items = items.filter(d =>
      d.state !== 'complete' || new Date(d.endTime || 0).getTime() > cutoff
    );
  }

  if (!items.length) {
    list.innerHTML = '';
    empty.classList.remove('hidden');
    return;
  }

  empty.classList.add('hidden');
  list.innerHTML = items.map(d => downloadCard(d)).join('');
  bindCardActions(list);
}

function downloadCard(d) {
  const name    = fileName(d);
  const icon    = fileIcon(name);
  const pct     = d.totalBytes > 0 ? Math.round(d.bytesReceived / d.totalBytes * 100) : -1;
  const isQueued = (state.queuedDownloads || []).includes(d.id);

  let stClass = '', stLabel = '';
  if (d.state === 'complete')                 { stClass = 'st-complete'; stLabel = 'Complete'; }
  else if (d.state === 'interrupted')         { stClass = 'st-failed';   stLabel = 'Failed'; }
  else if (d.paused && isQueued)              { stClass = 'st-queued';   stLabel = 'Queued'; }
  else if (d.paused)                          { stClass = 'st-paused';   stLabel = 'Paused'; }
  else                                        { stClass = 'st-active';   stLabel = 'Downloading'; }

  const speed = calcSpeed(d.id, d.bytesReceived);
  let meta = '';

  if (d.state === 'in_progress') {
    meta = fmtBytes(d.bytesReceived);
    if (d.totalBytes > 0) meta += ` / ${fmtBytes(d.totalBytes)} (${pct}%)`;
    if (speed > 0 && !d.paused) meta += `  •  ${fmtBytes(speed)}/s`;
    if (d.estimatedEndTime && !d.paused) {
      const eta = Math.max(0, Math.round((new Date(d.estimatedEndTime) - Date.now()) / 1000));
      if (eta > 0) meta += `  •  ${fmtTime(eta)} left`;
    }
  } else if (d.state === 'complete') {
    meta = fmtBytes(d.totalBytes || d.fileSize || d.bytesReceived);
  } else if (d.state === 'interrupted') {
    meta = friendlyError(d.error) || 'Download interrupted';
    const retries = (state.retryCount || {})[d.id];
    if (retries) meta += ` • Retry ${retries}/${state.settings?.autoResumeMaxRetries || '?'}`;
  }

  let barClass = '';
  let barWidth = pct >= 0 ? pct : 0;
  if (d.state === 'complete')    { barClass = 'done'; barWidth = 100; }
  if (d.state === 'interrupted') { barClass = 'error'; }

  const trigger = (state.triggers || {})[d.id];
  let triggerHTML = '';
  if (trigger) {
    triggerHTML = `
      <div class="trigger-badge">
        ⚡ On complete: <strong>${triggerLabel(trigger.action)}</strong>
        <button class="remove-trigger" data-action="removeTrigger" data-id="${d.id}"
                title="Remove trigger" aria-label="Remove trigger">✕</button>
      </div>`;
  }

  let actions = '';
  if (d.state === 'in_progress') {
    if (d.paused) {
      actions += btnHtml('▶ Resume', 'resume', d.id, 'btn-success btn-sm');
    } else {
      actions += btnHtml('⏸ Pause', 'pause', d.id, 'btn-secondary btn-sm');
    }
    actions += btnHtml('✕ Cancel', 'cancel', d.id, 'btn-danger btn-sm');
    if (!trigger) {
      actions += btnHtml('⚡ Trigger', 'openTrigger', d.id, 'btn-primary btn-sm');
    }
  } else if (d.state === 'interrupted') {
    actions += btnHtml('🔄 Retry', 'retry', d.id, 'btn-primary btn-sm');
    if (!trigger) {
      actions += btnHtml('⚡ Trigger', 'openTrigger', d.id, 'btn-sm btn-outline');
    }
  } else if (d.state === 'complete') {
    actions += btnHtml('📂 Show', 'show', d.id, 'btn-secondary btn-sm');
  }

  return `
    <div class="dl-card">
      <div class="dl-top">
        <span class="dl-icon">${icon}</span>
        <div class="dl-info">
          <div class="dl-name" title="${esc(d.filename || d.url || name)}">${esc(name)}</div>
          <div class="dl-meta">${esc(meta)}</div>
        </div>
        <span class="dl-status ${stClass}">${stLabel}</span>
      </div>
      <div class="progress">
        <div class="progress-fill ${barClass}" style="width:${barWidth}%"></div>
      </div>
      <div class="dl-actions">${actions}</div>
      ${triggerHTML}
    </div>`;
}

// ── Render queue ───────────────────────────────────────────
function renderQueue() {
  const list   = $('#queue-list');
  const empty  = $('#queue-empty');
  const ids    = state.queuedDownloads || [];
  const countEl = $('#queue-count');

  countEl.textContent = ids.length;

  if (!ids.length) {
    list.innerHTML = '';
    empty.classList.remove('hidden');
    return;
  }

  empty.classList.add('hidden');

  const items = ids
    .map(id => (state.downloads || []).find(d => d.id === id))
    .filter(Boolean);

  if (!items.length) {
    list.innerHTML = '';
    empty.classList.remove('hidden');
    return;
  }

  list.innerHTML = items.map((d, i) => {
    const name = fileName(d);
    const pct = d.totalBytes > 0 ? Math.round(d.bytesReceived / d.totalBytes * 100) : 0;

    return `
      <div class="dl-card queue-card">
        <span class="queue-pos">${i + 1}</span>
        <div style="flex:1;min-width:0">
          <div class="dl-name" title="${esc(name)}">${esc(name)}</div>
          <div class="dl-meta">
            ${fmtBytes(d.bytesReceived)}${d.totalBytes > 0 ? ' / ' + fmtBytes(d.totalBytes) : ''} — ${pct}%
          </div>
          <div class="progress">
            <div class="progress-fill" style="width:${pct}%"></div>
          </div>
        </div>
        <div class="queue-arrows">
          <button data-action="queueUp" data-id="${d.id}"
                  ${i === 0 ? 'disabled' : ''} title="Move up" aria-label="Move up">▲</button>
          <button data-action="queueDown" data-id="${d.id}"
                  ${i === items.length - 1 ? 'disabled' : ''} title="Move down" aria-label="Move down">▼</button>
        </div>
        ${btnHtml('▶', 'resume', d.id, 'btn-success btn-sm')}
      </div>`;
  }).join('');

  bindCardActions(list);
}

// ── Bind card action buttons ───────────────────────────────
function bindCardActions(container) {
  container.querySelectorAll('[data-action]').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      handleAction(btn.dataset.action, Number(btn.dataset.id));
    });
  });
}

// ── Actions ────────────────────────────────────────────────
async function handleAction(action, id) {
  try {
    switch (action) {
      case 'pause':
        await msg({ type: 'pauseDownload', downloadId: id });
        showToast('⏸️', 'Download paused');
        break;
      case 'resume':
        await msg({ type: 'resumeDownload', downloadId: id });
        showToast('▶️', 'Download resumed');
        break;
      case 'cancel':
        await msg({ type: 'cancelDownload', downloadId: id });
        showToast('✕', 'Download cancelled');
        break;
      case 'retry':
        await msg({ type: 'retryDownload', downloadId: id });
        showToast('🔄', 'Retrying download');
        break;
      case 'show':
        try { chrome.downloads.show(id); } catch {}
        break;
      case 'openTrigger':
        openModal(id);
        return;
      case 'removeTrigger':
        await msg({ type: 'removeTrigger', downloadId: id });
        showToast('🗑️', 'Trigger removed');
        break;
      case 'queueUp':
        await moveQueue(id, -1);
        break;
      case 'queueDown':
        await moveQueue(id, 1);
        break;
    }
    await refresh();
  } catch (e) {
    showToast('❌', `Error: ${e.message}`);
    console.error('[DLM Popup]', action, e);
  }
}

async function moveQueue(id, dir) {
  const q = [...(state.queuedDownloads || [])];
  const i = q.indexOf(id);
  if (i === -1) return;
  const ni = i + dir;
  if (ni < 0 || ni >= q.length) return;
  [q[i], q[ni]] = [q[ni], q[i]];
  await BC.storage.set({ queuedDownloads: q });
  await refresh();
}

// ── Filter bar ─────────────────────────────────────────────
function initFilterBar() {
  $('#filter-status').addEventListener('change', () => renderDownloads());

  $('#btn-clear-completed').addEventListener('click', async () => {
    try {
      await msg({ type: 'clearCompleted' });
      showToast('🗑️', 'Completed downloads cleared');
      await refresh();
    } catch (e) {
      showToast('❌', e.message);
    }
  });
}

// ── Stepper ────────────────────────────────────────────────
function initStepper() {
  const valEl = $('#concurrent-value');

  $('#concurrent-minus').addEventListener('click', async () => {
    if (maxConcurrent <= 1) return;
    maxConcurrent--;
    valEl.textContent = maxConcurrent;
    await saveSetting();
  });

  $('#concurrent-plus').addEventListener('click', async () => {
    if (maxConcurrent >= 10) return;
    maxConcurrent++;
    valEl.textContent = maxConcurrent;
    await saveSetting();
  });
}

// ── Settings UI ────────────────────────────────────────────
function initSettingsUI() {
  ['#auto-resume-enabled', '#max-retries', '#retry-delay',
   '#show-notifications', '#queue-enabled'].forEach(sel => {
    $(sel).addEventListener('change', saveSetting);
  });

  $('#btn-reset-settings').addEventListener('click', async () => {
    try {
      await msg({
        type: 'updateSettings',
        settings: {
          autoResumeEnabled: true,
          autoResumeMaxRetries: 5,
          autoResumeDelaySeconds: 5,
          maxConcurrentDownloads: 3,
          queueEnabled: false,
          showNotifications: true
        }
      });
      maxConcurrent = 3;
      showToast('🔄', 'Settings reset to defaults');
      await refresh();
    } catch (e) {
      showToast('❌', e.message);
    }
  });
}

async function saveSetting() {
  const s = {
    autoResumeEnabled:      $('#auto-resume-enabled').checked,
    autoResumeMaxRetries:   Number($('#max-retries').value),
    autoResumeDelaySeconds: Number($('#retry-delay').value),
    maxConcurrentDownloads: maxConcurrent,
    queueEnabled:           $('#queue-enabled').checked,
    showNotifications:      $('#show-notifications').checked
  };

  try {
    const res = await msg({ type: 'updateSettings', settings: s });
    if (res.settings) state.settings = res.settings;
    syncSettingsUI();
    showToast('✅', 'Settings saved');
  } catch (e) {
    showToast('❌', e.message);
  }
}

function syncSettingsUI() {
  const s = state.settings;
  if (!s) return;

  $('#auto-resume-enabled').checked = !!s.autoResumeEnabled;
  $('#max-retries').value           = s.autoResumeMaxRetries ?? 5;
  $('#retry-delay').value           = s.autoResumeDelaySeconds ?? 5;
  $('#show-notifications').checked  = !!s.showNotifications;
  $('#queue-enabled').checked       = !!s.queueEnabled;

  maxConcurrent = s.maxConcurrentDownloads ?? 3;
  $('#concurrent-value').textContent = maxConcurrent;

  $('#resume-options').classList.toggle('hidden', !s.autoResumeEnabled);
  $('#queue-options').classList.toggle('hidden', !s.queueEnabled);
}

// ── Trigger modal ──────────────────────────────────────────
function initModal() {
  $('#modal-close').addEventListener('click', closeModal);
  $('#btn-trigger-cancel').addEventListener('click', closeModal);
  $('#trigger-modal').addEventListener('click', e => {
    if (e.target.id === 'trigger-modal') closeModal();
  });
  $('#btn-trigger-save').addEventListener('click', saveTrigger);
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && modalDownloadId !== null) closeModal();
  });

  $$('input[name="trigger-action"]').forEach(radio => {
    radio.addEventListener('change', () => {
      $('#param-url').classList.toggle('hidden',       radio.value !== 'open_url');
      $('#param-resume').classList.toggle('hidden',    radio.value !== 'resume_download');
      $('#param-start-url').classList.toggle('hidden', radio.value !== 'start_download');
    });
  });
}

function openModal(downloadId) {
  modalDownloadId = downloadId;
  const d = (state.downloads || []).find(x => x.id === downloadId);
  $('#modal-download-name').textContent = d ? fileName(d) : `Download #${downloadId}`;

  const firstRadio = $('input[name="trigger-action"][value="notification"]');
  if (firstRadio) firstRadio.checked = true;
  $('#param-url').classList.add('hidden');
  $('#param-resume').classList.add('hidden');
  $('#param-start-url').classList.add('hidden');
  $('#trigger-url').value = '';
  $('#trigger-start-url').value = '';

  const sel = $('#trigger-target-download');
  sel.innerHTML = '<option value="">— select download —</option>';

  (state.downloads || [])
    .filter(x => x.id !== downloadId && x.state === 'in_progress' && x.paused)
    .forEach(x => sel.appendChild(makeOption(x.id, fileName(x))));

  (state.queuedDownloads || [])
    .filter(id => id !== downloadId)
    .forEach(id => {
      if (sel.querySelector(`option[value="${id}"]`)) return;
      const x = (state.downloads || []).find(d2 => d2.id === id);
      if (x) sel.appendChild(makeOption(x.id, `${fileName(x)} (queued)`));
    });

  const existing = (state.triggers || {})[downloadId];
  if (existing) {
    const radio = $(`input[name="trigger-action"][value="${existing.action}"]`);
    if (radio) { radio.checked = true; radio.dispatchEvent(new Event('change')); }
    if (existing.action === 'open_url')        $('#trigger-url').value = existing.params?.url || '';
    if (existing.action === 'start_download')  $('#trigger-start-url').value = existing.params?.url || '';
    if (existing.action === 'resume_download') $('#trigger-target-download').value = existing.params?.targetId || '';
  }

  $('#trigger-modal').classList.remove('hidden');
}

function closeModal() {
  $('#trigger-modal').classList.add('hidden');
  modalDownloadId = null;
}

async function saveTrigger() {
  if (modalDownloadId === null) return;
  const action = $('input[name="trigger-action"]:checked')?.value;
  if (!action) return;

  const params = {};
  if (action === 'open_url') {
    const url = $('#trigger-url').value.trim();
    if (!url) { $('#trigger-url').focus(); return; }
    params.url = url;
  }
  if (action === 'start_download') {
    const url = $('#trigger-start-url').value.trim();
    if (!url) { $('#trigger-start-url').focus(); return; }
    params.url = url;
  }
  if (action === 'resume_download') {
    const tid = $('#trigger-target-download').value;
    if (!tid) { $('#trigger-target-download').focus(); return; }
    params.targetId = Number(tid);
  }

  try {
    await msg({ type: 'setTrigger', downloadId: modalDownloadId, action, params });
    showToast('⚡', 'Trigger saved');
    closeModal();
    await refresh();
  } catch (e) {
    showToast('❌', e.message);
  }
}

// ── Toast ──────────────────────────────────────────────────
let toastTimer = null;

function showToast(icon, text) {
  const toast = $('#toast');
  $('#toast-icon').textContent = icon;
  $('#toast-text').textContent = text;
  toast.classList.remove('hidden');
  void toast.offsetWidth;
  toast.classList.add('show');

  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.classList.add('hidden'), 300);
  }, 2500);
}

// ── Utilities ──────────────────────────────────────────────
function fileName(d) {
  return (d.filename || d.url || '').split(/[/\\]/).pop() || 'download';
}

function fileIcon(name) {
  const ext = (name.split('.').pop() || '').toLowerCase();
  const map = {
    pdf:'📄',doc:'📝',docx:'📝',txt:'📝',rtf:'📝',odt:'📝',
    xls:'📊',xlsx:'📊',csv:'📊',ppt:'📊',pptx:'📊',ods:'📊',
    zip:'📦',rar:'📦','7z':'📦',tar:'📦',gz:'📦',bz2:'📦',xz:'📦',zst:'📦',
    jpg:'🖼️',jpeg:'🖼️',png:'🖼️',gif:'🖼️',bmp:'🖼️',svg:'🖼️',webp:'🖼️',
    ico:'🖼️',tiff:'🖼️',avif:'🖼️',heic:'🖼️',
    mp4:'🎬',avi:'🎬',mkv:'🎬',mov:'🎬',wmv:'🎬',flv:'🎬',webm:'🎬',m4v:'🎬',
    mp3:'🎵',wav:'🎵',flac:'🎵',aac:'🎵',ogg:'🎵',wma:'🎵',m4a:'🎵',opus:'🎵',
    exe:'⚙️',msi:'⚙️',dmg:'⚙️',deb:'⚙️',rpm:'⚙️',appimage:'⚙️',apk:'⚙️',
    iso:'💿',img:'💿',
    html:'🌐',htm:'🌐',css:'🌐',js:'🌐',ts:'🌐',jsx:'🌐',tsx:'🌐',
    json:'📋',xml:'📋',yaml:'📋',yml:'📋',toml:'📋',
    py:'🐍',java:'☕',c:'💻',cpp:'💻',rs:'💻',go:'💻',rb:'💻',php:'💻',
    torrent:'🧲',ttf:'🔤',otf:'🔤',woff:'🔤',woff2:'🔤',
    sql:'🗄️',db:'🗄️',sqlite:'🗄️'
  };
  return map[ext] || '📄';
}

function fmtBytes(b) {
  if (!b || b <= 0) return '0 B';
  const u = ['B','KB','MB','GB','TB'];
  const i = Math.floor(Math.log(b) / Math.log(1024));
  return (b / Math.pow(1024, i)).toFixed(i > 0 ? 1 : 0) + ' ' + u[i];
}

function fmtTime(sec) {
  if (sec < 60) return `${sec}s`;
  if (sec < 3600) return `${Math.floor(sec/60)}m ${sec%60}s`;
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return `${h}h ${m}m`;
}

function calcSpeed(id, bytes) {
  const now = Date.now();
  const pb = prevBytes[id] || 0;
  const pt = prevTime[id]  || now;
  prevBytes[id] = bytes;
  prevTime[id]  = now;
  const dt = (now - pt) / 1000;
  if (dt <= 0) return 0;
  return Math.max(0, (bytes - pb) / dt);
}

function friendlyError(code) {
  const map = {
    'FILE_FAILED':'File write error','FILE_ACCESS_DENIED':'Access denied',
    'FILE_NO_SPACE':'No disk space','FILE_TOO_LARGE':'File too large',
    'FILE_VIRUS_INFECTED':'Virus detected','FILE_BLOCKED':'Blocked',
    'FILE_SECURITY_CHECK_FAILED':'Security check failed',
    'NETWORK_FAILED':'Network error','NETWORK_TIMEOUT':'Timed out',
    'NETWORK_DISCONNECTED':'Disconnected','NETWORK_SERVER_DOWN':'Server down',
    'SERVER_FAILED':'Server error','SERVER_UNAUTHORIZED':'Unauthorized',
    'SERVER_FORBIDDEN':'Forbidden','SERVER_UNREACHABLE':'Unreachable',
    'SERVER_NO_RANGE':'Resume unsupported',
    'USER_CANCELED':'Cancelled','USER_SHUTDOWN':'Browser closed',
    'CRASH':'Browser crashed'
  };
  return map[code] || code || 'Unknown error';
}

function triggerLabel(action) {
  // Use i18n labels from messages.json
  const i18nMap = {
    notification:     'triggerNotification',
    close_browser:    'triggerCloseBrowser',
    shutdown:         'triggerShutdown',
    open_file:        'triggerOpenFile',
    open_url:         'triggerOpenUrl',
    resume_download:  'triggerResume',
    start_download:   'triggerStartDownload'
  };
  const key = i18nMap[action];
  if (key) {
    const label = i18n(key);
    if (label) return label;
  }
  // Fallback
  const fallbacks = {
    notification:'Notify', close_browser:'Close Browser',
    shutdown:'Shutdown PC', open_file:'Open File',
    open_url:'Open URL', resume_download:'Resume Download',
    start_download:'Start Download'
  };
  return fallbacks[action] || action;
}

function btnHtml(label, action, id, cls = '') {
  return `<button class="btn ${cls}" data-action="${action}" data-id="${id}">${label}</button>`;
}

function makeOption(value, text) {
  const opt = document.createElement('option');
  opt.value = value;
  opt.textContent = text;
  return opt;
}

function esc(s) {
  const d = document.createElement('div');
  d.textContent = s || '';
  return d.innerHTML;
}