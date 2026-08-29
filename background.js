importScripts('compat.js');

const BC = globalThis.BrowserCompat;

// ── i18n helper for service worker ─────────────────────────
function i18n(key, fallback = '') {
  try {
    const msg = chrome.i18n.getMessage(key);
    return msg || fallback;
  } catch {
    return fallback;
  }
}

// Then replace hardcoded notification strings:
// BEFORE:  title: 'Download Complete ✅'
// AFTER:   title: i18n('notifDownloadComplete', 'Download Complete ✅')

// ── Defaults ────────────────────────────────────────────────
const DEFAULT_SETTINGS = {
  autoResumeEnabled: true,
  autoResumeMaxRetries: 5,
  autoResumeDelaySeconds: 5,
  maxConcurrentDownloads: 3,
  queueEnabled: false,
  showNotifications: true
};

const getSettings       = () => BC.storage.get('settings',        { ...DEFAULT_SETTINGS });
const getTriggers       = () => BC.storage.get('triggers',        {});
const getRetryCount     = () => BC.storage.get('retryCount',      {});
const getQueuedIds      = () => BC.storage.get('queuedDownloads', []);
const getPausedByQueue  = () => BC.storage.get('pausedByQueue',   {});

// ── Badge ───────────────────────────────────────────────────
async function updateBadge() {
  if (!BC.isFeatureAvailable('action')) return;
  try {
    const active = await chrome.downloads.search({ state: 'in_progress', paused: false });
    const queued = await getQueuedIds();
    const total  = active.length + queued.length;
    chrome.action.setBadgeText({ text: total > 0 ? String(total) : '' });
    chrome.action.setBadgeBackgroundColor({ color: '#3b82f6' });
    if (typeof chrome.action.setBadgeTextColor === 'function') {
      chrome.action.setBadgeTextColor({ color: '#ffffff' });
    }
  } catch {}
}

// ── Install / Startup ───────────────────────────────────────
chrome.runtime.onInstalled.addListener(async ({ reason }) => {
  if (reason === 'install') {
    await BC.storage.set({
      settings:         { ...DEFAULT_SETTINGS },
      triggers:         {},
      retryCount:       {},
      queuedDownloads:  [],
      pausedByQueue:    {},
      installedBrowser: BC.detect().browser
    });
    try {
      chrome.tabs.create({ url: chrome.runtime.getURL('welcome.html') });
    } catch {}
  }
  startAlarms();
});

chrome.runtime.onStartup.addListener(async () => {
  startAlarms();
  await autoResumeInterrupted();
  updateBadge();
});

function startAlarms() {
  BC.safeAlarmCreate('queueTick', { periodInMinutes: 1 });
}

chrome.runtime.onConnect.addListener((port) => {
  if (port.name === 'keepAlive') {
    port.onDisconnect.addListener(() => {});
  }
});

// ── Download events ─────────────────────────────────────────
chrome.downloads.onCreated.addListener(async (item) => {
  const s = await getSettings();
  if (s.queueEnabled) await enforceQueue(item);
  updateBadge();
});

chrome.downloads.onChanged.addListener(async (delta) => {
  if (!delta.state) { updateBadge(); return; }
  if (delta.state.current === 'complete')    await onComplete(delta.id);
  if (delta.state.current === 'interrupted') await onInterrupted(delta.id, delta.error?.current);
  updateBadge();
});

chrome.downloads.onErased.addListener(async (id) => {
  const triggers = await getTriggers();
  const retries  = await getRetryCount();
  const queued   = await getQueuedIds();
  const paused   = await getPausedByQueue();
  delete triggers[id]; delete retries[id]; delete paused[id];
  await BC.storage.set({
    triggers, retryCount: retries,
    queuedDownloads: queued.filter(x => x !== id),
    pausedByQueue: paused
  });
});

// ── Complete handler ────────────────────────────────────────
async function onComplete(id) {
  const retries = await getRetryCount();
  delete retries[id];
  await BC.storage.set({ retryCount: retries });

  const queued = await getQueuedIds();
  await BC.storage.set({ queuedDownloads: queued.filter(x => x !== id) });

  const paused = await getPausedByQueue();
  delete paused[id];
  await BC.storage.set({ pausedByQueue: paused });

  const triggers = await getTriggers();
  if (triggers[id]) {
    await executeTrigger(id, triggers[id]);
    delete triggers[id];
    await BC.storage.set({ triggers });
  }

  const s = await getSettings();
  if (s.showNotifications) {
    let itemName = `Download #${id}`;
    try {
      const [item] = await chrome.downloads.search({ id });
      if (item) itemName = fileName(item);
    } catch {}

    await BC.safeNotify(`complete-${id}`, {
      title:   i18n('notifDownloadComplete', 'Download Complete ✅'),
      message: itemName,
      priority: 1
    });
  }

  if (s.queueEnabled) await advanceQueue();
}

// ── Interrupted handler ─────────────────────────────────────
async function onInterrupted(id, errorReason) {
  const queued = await getQueuedIds();
  if (queued.includes(id)) {
    await BC.storage.set({ queuedDownloads: queued.filter(x => x !== id) });
    const s = await getSettings();
    if (s.queueEnabled) await advanceQueue();
  }

  const s = await getSettings();
  if (!s.autoResumeEnabled) return;

  const nonRetryable = [
    'USER_CANCELED','USER_SHUTDOWN','FILE_SECURITY_CHECK_FAILED',
    'FILE_BLOCKED','FILE_ACCESS_DENIED','FILE_NO_SPACE','FILE_TOO_LARGE'
  ];
  if (errorReason && nonRetryable.includes(errorReason)) {
    await notifyFailure(id, `Failed: ${friendlyError(errorReason)}`, 0);
    return;
  }

  const retries = await getRetryCount();
  const count   = retries[id] || 0;

  if (count >= s.autoResumeMaxRetries) {
    await notifyFailure(id, `Failed after ${count} retries`, count);
    delete retries[id];
    await BC.storage.set({ retryCount: retries });
    return;
  }

  retries[id] = count + 1;
  await BC.storage.set({ retryCount: retries });
  BC.safeAlarmCreate(`retry-${id}`, { when: Date.now() + s.autoResumeDelaySeconds * 1000 });
}

async function notifyFailure(id, reason, retryCount) {
  const s = await getSettings();
  if (!s.showNotifications) return;

  let itemName = `Download #${id}`;
  try {
    const [item] = await chrome.downloads.search({ id });
    if (item) itemName = fileName(item);
  } catch {}

  await BC.safeNotify(`failed-${id}`, {
    title:   i18n('notifDownloadFailed', 'Download Failed ❌'),
    message: `${itemName}\n${reason}`,
    priority: 2
  });
}

// ── Trigger execution ───────────────────────────────────────
async function executeTrigger(id, trigger) {
  let item = null;
  try { const [d] = await chrome.downloads.search({ id }); item = d; } catch {}
  const itemName = item ? fileName(item) : `Download #${id}`;
  const extName  = i18n('extName', 'Download Manager Pro');

  switch (trigger.action) {
    case 'notification':
      await BC.safeNotify(`trig-${id}`, {
        title:   trigger.params?.title || `⚡ ${extName}`,
        message: trigger.params?.message || `${itemName} completed!`,
        priority: 2
      });
      break;

    case 'close_browser':
      await BC.safeNotify(`trig-close-${id}`, {
        title:   i18n('notifClosingBrowser', 'Closing Browser'),
        message: `Triggered by: ${itemName}`
      });
      await delay(1500);
      await BC.closeAllWindows();
      break;

    case 'shutdown': {
      const result = await BC.safeNativeMessage(
        'com.dlmanager.shutdown', { command: 'shutdown' }
      );
      if (result.success) {
        await BC.safeNotify(`trig-shutdown-${id}`, {
          title:   i18n('notifShuttingDown', '⏻ Shutting Down'),
          message: 'Your PC will shut down shortly.'
        });
      } else {
        await BC.safeNotify(`trig-shutdown-fb-${id}`, {
          title: '⏻ Shutdown Requested',
          message: 'Native helper not found. Closing browser instead.',
          priority: 2
        });
        await delay(2000);
        await BC.closeAllWindows();
      }
      break;
    }

    case 'open_file':
      await BC.safeDownloadOpen(id);
      break;

    case 'open_url':
      if (trigger.params?.url && BC.isFeatureAvailable('tabs')) {
        try { await chrome.tabs.create({ url: trigger.params.url }); } catch {}
      }
      break;

    case 'resume_download': {
      const targetId = trigger.params?.targetId;
      if (targetId) {
        const res = await BC.safeResume(targetId);
        if (res.success) {
          const q = await getQueuedIds();
          await BC.storage.set({ queuedDownloads: q.filter(x => x !== targetId) });
        }
      }
      break;
    }

    case 'start_download':
      if (trigger.params?.url) {
        try { await chrome.downloads.download({ url: trigger.params.url }); } catch {}
      }
      break;
  }
}

// ── Queue management ────────────────────────────────────────
async function enforceQueue(newItem) {
  const s = await getSettings();
  let active;
  try { active = await chrome.downloads.search({ state: 'in_progress', paused: false }); }
  catch { return; }
  const running = active.filter(d => d.id !== newItem.id).length;

  if (running >= s.maxConcurrentDownloads) {
    const res = await BC.safePause(newItem.id);
    if (res.success) {
      const q = await getQueuedIds();
      if (!q.includes(newItem.id)) { q.push(newItem.id); await BC.storage.set({ queuedDownloads: q }); }
      const paused = await getPausedByQueue();
      paused[newItem.id] = true;
      await BC.storage.set({ pausedByQueue: paused });
    }
  }
}

async function advanceQueue() {
  const s = await getSettings();
  if (!s.queueEnabled) return;
  const q = await getQueuedIds();
  if (!q.length) return;

  let active;
  try { active = await chrome.downloads.search({ state: 'in_progress', paused: false }); }
  catch { return; }

  let slots = s.maxConcurrentDownloads - active.length;
  if (slots <= 0) return;

  const stillQueued = [];
  for (const id of q) {
    if (slots <= 0) { stillQueued.push(id); continue; }
    let d;
    try { const r = await chrome.downloads.search({ id }); d = r[0]; } catch { continue; }
    if (!d || d.state === 'complete' || d.state === 'interrupted') continue;
    if (d.paused) {
      const res = await BC.safeResume(id);
      if (res.success) {
        slots--;
        const paused = await getPausedByQueue();
        delete paused[id];
        await BC.storage.set({ pausedByQueue: paused });
      } else {
        stillQueued.push(id);
      }
    }
  }
  await BC.storage.set({ queuedDownloads: stillQueued });
}

async function enforceQueueLimits(settings) {
  let active;
  try { active = await chrome.downloads.search({ state: 'in_progress', paused: false }); }
  catch { return; }
  if (active.length <= settings.maxConcurrentDownloads) return;

  const sorted = active.sort((a, b) => new Date(b.startTime) - new Date(a.startTime));
  const toPause = sorted.slice(settings.maxConcurrentDownloads);
  const q = await getQueuedIds();
  const paused = await getPausedByQueue();

  for (const d of toPause) {
    const res = await BC.safePause(d.id);
    if (res.success) {
      if (!q.includes(d.id)) q.push(d.id);
      paused[d.id] = true;
    }
  }
  await BC.storage.set({ queuedDownloads: q, pausedByQueue: paused });
}

async function autoResumeInterrupted() {
  const s = await getSettings();
  if (!s.autoResumeEnabled) return;
  try {
    const list = await chrome.downloads.search({ state: 'interrupted' });
    const cutoff = Date.now() - 86400000;
    for (const d of list) {
      if (d.endTime && new Date(d.endTime).getTime() > cutoff) {
        await onInterrupted(d.id, d.error);
      }
    }
  } catch {}
}

// ── Alarms ──────────────────────────────────────────────────
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'queueTick') {
    await advanceQueue();
    updateBadge();
    return;
  }
  if (alarm.name.startsWith('retry-')) {
    const id = Number(alarm.name.slice(6));
    if (Number.isNaN(id)) return;
    let item;
    try { const r = await chrome.downloads.search({ id }); item = r[0]; } catch { return; }
    if (!item || item.state !== 'interrupted') return;
    await BC.safeResume(id);
  }
});

// ── Message bus ─────────────────────────────────────────────
chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  if (sender.id !== chrome.runtime.id) { reply({ error: 'unauthorized' }); return; }
  handleMsg(msg).then(reply).catch(e => reply({ error: e.message || 'Unknown error' }));
  return true;
});

async function handleMsg(msg) {
  switch (msg.type) {
    case 'getData': {
      let downloads = [];
      try { downloads = await chrome.downloads.search({ orderBy: ['-startTime'], limit: 200 }); }
      catch {}
      return {
        downloads,
        settings:        await getSettings(),
        triggers:        await getTriggers(),
        retryCount:      await getRetryCount(),
        queuedDownloads: await getQueuedIds(),
        browser:         BC.detect()
      };
    }
    case 'setTrigger': {
      const t = await getTriggers();
      t[msg.downloadId] = { action: msg.action, params: msg.params || {}, createdAt: Date.now() };
      await BC.storage.set({ triggers: t });
      return { ok: true };
    }
    case 'removeTrigger': {
      const t = await getTriggers();
      delete t[msg.downloadId];
      await BC.storage.set({ triggers: t });
      return { ok: true };
    }
    case 'updateSettings': {
      const cur = await getSettings();
      const next = { ...cur, ...msg.settings };
      await BC.storage.set({ settings: next });
      if (next.queueEnabled) await enforceQueueLimits(next);
      else {
        const q = await getQueuedIds();
        for (const id of q) await BC.safeResume(id);
        await BC.storage.set({ queuedDownloads: [], pausedByQueue: {} });
      }
      return { ok: true, settings: next };
    }
    case 'pauseDownload':  return { ok: (await BC.safePause(msg.downloadId)).success };
    case 'resumeDownload': {
      const res = await BC.safeResume(msg.downloadId);
      if (res.success) {
        const q = await getQueuedIds();
        await BC.storage.set({ queuedDownloads: q.filter(x => x !== msg.downloadId) });
        const paused = await getPausedByQueue();
        delete paused[msg.downloadId];
        await BC.storage.set({ pausedByQueue: paused });
      }
      return { ok: res.success, error: res.error };
    }
    case 'cancelDownload': return { ok: (await BC.safeCancel(msg.downloadId)).success };
    case 'retryDownload':  return { ok: (await BC.safeResume(msg.downloadId)).success };
    case 'clearCompleted': {
      try {
        const c = await chrome.downloads.search({ state: 'complete' });
        for (const d of c) { try { await chrome.downloads.erase({ id: d.id }); } catch {} }
      } catch {}
      return { ok: true };
    }
    case 'getBrowserInfo': {
      return {
        ...BC.detect(),
        displayName: BC.getBrowserDisplayName(),
        storeUrl:    BC.getStoreUrl(),
        features: {
          downloads:     BC.isFeatureAvailable('downloads'),
          notifications: BC.isFeatureAvailable('notifications'),
          nativeMsg:     BC.isFeatureAvailable('nativeMessaging')
        }
      };
    }
    default: return { error: `Unknown type: ${msg.type}` };
  }
}

// ── Util ────────────────────────────────────────────────────
function fileName(item) {
  return (item.filename || item.url || '').split(/[/\\]/).pop() || 'Download';
}

function friendlyError(code) {
  const map = {
    'FILE_FAILED':'File write error','FILE_ACCESS_DENIED':'Access denied',
    'FILE_NO_SPACE':'No disk space','FILE_TOO_LARGE':'File too large',
    'FILE_VIRUS_INFECTED':'Virus detected','FILE_BLOCKED':'Blocked',
    'NETWORK_FAILED':'Network error','NETWORK_TIMEOUT':'Timed out',
    'NETWORK_DISCONNECTED':'Disconnected','NETWORK_SERVER_DOWN':'Server down',
    'SERVER_FAILED':'Server error','SERVER_NO_RANGE':'Resume unsupported',
    'USER_CANCELED':'Cancelled','USER_SHUTDOWN':'Browser closed','CRASH':'Crashed'
  };
  return map[code] || code || 'Unknown error';
}

function delay(ms) { return new Promise(r => setTimeout(r, ms)); }