/* ═══════════════════════════════════════════════════════════
   Download Manager Pro — Cross-Browser Compatibility Layer
   
   Supports: Chrome, Edge, Brave, Opera, Vivaldi, Arc,
             and other Chromium-based browsers.
   ═══════════════════════════════════════════════════════════ */

const BrowserCompat = (() => {
  'use strict';

  // ── Browser detection cache ──────────────────────────────
  let _detectedBrowser = null;
  let _detectedVersion = null;

  /**
   * Detect which Chromium-based browser is running.
   * Returns: 'brave' | 'edge' | 'opera' | 'vivaldi' | 'arc' |
   *          'yandex' | 'samsung' | 'whale' | 'chrome' | 'chromium'
   */
  function detect() {
    if (_detectedBrowser) return { browser: _detectedBrowser, version: _detectedVersion };

    const ua = (typeof navigator !== 'undefined' && navigator.userAgent) || '';

    // Order matters — check more specific browsers first
    const browsers = [
      { name: 'brave',    test: () => typeof navigator.brave !== 'undefined' || ua.includes('Brave') },
      { name: 'edge',     test: () => ua.includes('Edg/') || ua.includes('Edge/') },
      { name: 'opera',    test: () => ua.includes('OPR/') || ua.includes('Opera') || typeof opr !== 'undefined' },
      { name: 'vivaldi',  test: () => ua.includes('Vivaldi/') },
      { name: 'arc',      test: () => ua.includes('Arc/') },
      { name: 'yandex',   test: () => ua.includes('YaBrowser/') },
      { name: 'samsung',  test: () => ua.includes('SamsungBrowser/') },
      { name: 'whale',    test: () => ua.includes('Whale/') },
      { name: 'chrome',   test: () => ua.includes('Chrome/') && !ua.includes('Chromium/') },
      { name: 'chromium', test: () => ua.includes('Chromium/') }
    ];

    for (const b of browsers) {
      try {
        if (b.test()) { _detectedBrowser = b.name; break; }
      } catch { /* ignore */ }
    }

    if (!_detectedBrowser) _detectedBrowser = 'chromium';

    // Extract version
    const chromeMatch = ua.match(/(?:Chrome|Chromium|Edg|OPR|Vivaldi)\/(\d+)/);
    _detectedVersion = chromeMatch ? parseInt(chromeMatch[1], 10) : 0;

    return { browser: _detectedBrowser, version: _detectedVersion };
  }

  /**
   * Async detection for Brave (has async isBrave())
   */
  async function detectAsync() {
    const base = detect();
    if (base.browser !== 'chromium' && base.browser !== 'chrome') return base;

    // Brave exposes navigator.brave.isBrave()
    try {
      if (navigator.brave && typeof navigator.brave.isBrave === 'function') {
        const isBrave = await navigator.brave.isBrave();
        if (isBrave) {
          _detectedBrowser = 'brave';
          return { browser: 'brave', version: base.version };
        }
      }
    } catch { /* not Brave */ }

    return base;
  }

  // ── Feature detection ────────────────────────────────────
  const _featureCache = {};

  function isFeatureAvailable(feature) {
    if (feature in _featureCache) return _featureCache[feature];

    const checks = {
      'downloads':          () => !!chrome?.downloads,
      'downloads.open':     () => typeof chrome?.downloads?.open === 'function',
      'downloads.resume':   () => typeof chrome?.downloads?.resume === 'function',
      'downloads.pause':    () => typeof chrome?.downloads?.pause === 'function',
      'downloads.cancel':   () => typeof chrome?.downloads?.cancel === 'function',
      'downloads.show':     () => typeof chrome?.downloads?.show === 'function',
      'storage':            () => !!chrome?.storage?.local,
      'storage.session':    () => !!chrome?.storage?.session,
      'notifications':      () => !!chrome?.notifications,
      'alarms':             () => !!chrome?.alarms,
      'windows':            () => !!chrome?.windows,
      'tabs':               () => !!chrome?.tabs,
      'action':             () => !!chrome?.action,
      'nativeMessaging':    () => typeof chrome?.runtime?.sendNativeMessage === 'function',
      'offscreen':          () => !!chrome?.offscreen,
      'runtime.id':         () => !!chrome?.runtime?.id
    };

    const check = checks[feature];
    const result = check ? safeCall(check, false) : false;
    _featureCache[feature] = result;
    return result;
  }

  // ── Safe API wrappers ────────────────────────────────────

  /**
   * Show a notification with graceful fallback.
   * Brave may block notifications — we handle that silently.
   */
  async function safeNotify(id, options) {
    if (!isFeatureAvailable('notifications')) {
      console.warn('[DLM] Notifications API not available');
      return null;
    }

    try {
      // Check permission level (not all browsers support getPermissionLevel)
      if (typeof chrome.notifications.getPermissionLevel === 'function') {
        const level = await new Promise(r => chrome.notifications.getPermissionLevel(r));
        if (level === 'denied') {
          console.warn('[DLM] Notifications denied by browser');
          return null;
        }
      }

      return new Promise((resolve) => {
        chrome.notifications.create(id, {
          type: options.type || 'basic',
          iconUrl: options.iconUrl || chrome.runtime.getURL('icons/icon128.png'),
          title: options.title || 'Download Manager Pro',
          message: options.message || '',
          priority: options.priority || 1,
          silent: options.silent || false
        }, (notifId) => {
          if (chrome.runtime.lastError) {
            console.warn('[DLM] Notification error:', chrome.runtime.lastError.message);
            resolve(null);
          } else {
            resolve(notifId);
          }
        });
      });
    } catch (e) {
      console.warn('[DLM] Notification failed:', e.message);
      return null;
    }
  }

  /**
   * Open a downloaded file with fallback to show-in-folder.
   */
  async function safeDownloadOpen(downloadId) {
    // Try open first
    if (isFeatureAvailable('downloads.open')) {
      try {
        await chrome.downloads.open(downloadId);
        return { action: 'opened' };
      } catch (e) {
        console.warn('[DLM] downloads.open failed:', e.message);
      }
    }

    // Fallback to show in folder
    if (isFeatureAvailable('downloads.show')) {
      try {
        await chrome.downloads.show(downloadId);
        return { action: 'shown' };
      } catch (e) {
        console.warn('[DLM] downloads.show failed:', e.message);
      }
    }

    return { action: 'none', error: 'Cannot open or show download' };
  }

  /**
   * Resume a download with fallback to re-download.
   */
  async function safeResume(downloadId) {
    if (!isFeatureAvailable('downloads.resume')) {
      return { success: false, error: 'Resume not available' };
    }

    try {
      await chrome.downloads.resume(downloadId);
      return { success: true, method: 'resume' };
    } catch (e) {
      // Fallback: re-download from URL
      try {
        const [item] = await chrome.downloads.search({ id: downloadId });
        if (item?.url) {
          const opts = { url: item.url };
          if (item.filename) {
            const name = item.filename.split(/[/\\]/).pop();
            if (name) opts.filename = name;
          }
          const newId = await chrome.downloads.download(opts);
          return { success: true, method: 'redownload', newId };
        }
      } catch (e2) {
        return { success: false, error: e2.message };
      }
      return { success: false, error: e.message };
    }
  }

  /**
   * Pause a download safely.
   */
  async function safePause(downloadId) {
    if (!isFeatureAvailable('downloads.pause')) {
      return { success: false, error: 'Pause not available' };
    }
    try {
      await chrome.downloads.pause(downloadId);
      return { success: true };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  /**
   * Cancel a download safely.
   */
  async function safeCancel(downloadId) {
    if (!isFeatureAvailable('downloads.cancel')) {
      return { success: false, error: 'Cancel not available' };
    }
    try {
      await chrome.downloads.cancel(downloadId);
      return { success: true };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  /**
   * Create an alarm with browser-aware minimum period.
   * MV3 enforces minimum 1 minute for periodic alarms.
   */
  function safeAlarmCreate(name, alarmInfo) {
    if (!isFeatureAvailable('alarms')) {
      console.warn('[DLM] Alarms API not available');
      return;
    }

    // Enforce MV3 minimums
    if (alarmInfo.periodInMinutes !== undefined) {
      alarmInfo.periodInMinutes = Math.max(1, alarmInfo.periodInMinutes);
    }
    if (alarmInfo.delayInMinutes !== undefined) {
      alarmInfo.delayInMinutes = Math.max(0.5, alarmInfo.delayInMinutes);
    }

    try {
      chrome.alarms.create(name, alarmInfo);
    } catch (e) {
      console.warn('[DLM] Alarm create failed:', e.message);
    }
  }

  /**
   * Send a native message with proper error handling.
   */
  async function safeNativeMessage(hostName, message) {
    if (!isFeatureAvailable('nativeMessaging')) {
      return { success: false, error: 'Native messaging not available' };
    }

    return new Promise((resolve) => {
      try {
        chrome.runtime.sendNativeMessage(hostName, message, (response) => {
          if (chrome.runtime.lastError) {
            resolve({ success: false, error: chrome.runtime.lastError.message });
          } else {
            resolve({ success: true, response });
          }
        });
      } catch (e) {
        resolve({ success: false, error: e.message });
      }
    });
  }

  /**
   * Close all browser windows.
   */
  async function closeAllWindows() {
    if (!isFeatureAvailable('windows')) {
      return { success: false, error: 'Windows API not available' };
    }
    try {
      const wins = await chrome.windows.getAll();
      for (const w of wins) {
        try { await chrome.windows.remove(w.id); } catch {}
      }
      return { success: true };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  // ── Storage wrapper with fallback ────────────────────────

  const storage = {
    async get(key, fallback) {
      try {
        const result = await chrome.storage.local.get(key);
        return result[key] ?? fallback;
      } catch (e) {
        console.error('[DLM] Storage get error:', e);
        return fallback;
      }
    },

    async set(obj) {
      try {
        await chrome.storage.local.set(obj);
        return true;
      } catch (e) {
        console.error('[DLM] Storage set error:', e);
        return false;
      }
    },

    async remove(keys) {
      try {
        await chrome.storage.local.remove(keys);
        return true;
      } catch (e) {
        console.error('[DLM] Storage remove error:', e);
        return false;
      }
    }
  };

  // ── Service Worker keep-alive ────────────────────────────
  // Uses periodic alarms + download event listeners to keep
  // the service worker responsive. Different browsers have
  // different termination timeouts (Chrome ~30s, Edge ~5min).

  let _keepAlivePort = null;

  /**
   * Call from popup to keep the service worker alive while open.
   */
  function connectKeepAlive() {
    try {
      _keepAlivePort = chrome.runtime.connect({ name: 'keepAlive' });
      _keepAlivePort.onDisconnect.addListener(() => {
        _keepAlivePort = null;
        // Reconnect after a short delay
        setTimeout(connectKeepAlive, 1000);
      });
    } catch {
      _keepAlivePort = null;
    }
  }

  function disconnectKeepAlive() {
    if (_keepAlivePort) {
      try { _keepAlivePort.disconnect(); } catch {}
      _keepAlivePort = null;
    }
  }

  // ── Browser metadata ─────────────────────────────────────

  function getBrowserDisplayName() {
    const { browser } = detect();
    const names = {
      chrome: 'Google Chrome',
      edge: 'Microsoft Edge',
      brave: 'Brave',
      opera: 'Opera',
      vivaldi: 'Vivaldi',
      arc: 'Arc',
      yandex: 'Yandex Browser',
      samsung: 'Samsung Internet',
      whale: 'Naver Whale',
      chromium: 'Chromium'
    };
    return names[browser] || 'Browser';
  }

  function getStoreUrl() {
    const { browser } = detect();
    const urls = {
      chrome:  'https://chrome.google.com/webstore',
      edge:    'https://microsoftedge.microsoft.com/addons',
      opera:   'https://addons.opera.com',
      brave:   'https://chrome.google.com/webstore',  // Brave uses Chrome Web Store
      vivaldi: 'https://chrome.google.com/webstore',  // Vivaldi uses Chrome Web Store
      arc:     'https://chrome.google.com/webstore',
      yandex:  'https://chrome.google.com/webstore',
    };
    return urls[browser] || urls.chrome;
  }

  function getNativeHostDirs() {
    // Returns possible native messaging host directories for current browser
    // (These are informational — actual installation uses the install scripts)
    const { browser } = detect();
    return {
      browser,
      note: 'Use the install scripts in native-host/ for automatic setup.'
    };
  }

  // ── Utilities ────────────────────────────────────────────

  function safeCall(fn, fallback) {
    try { return fn(); } catch { return fallback; }
  }

  function getExtensionURL(path) {
    try {
      return chrome.runtime.getURL(path);
    } catch {
      return path;
    }
  }

  // ── Public API ───────────────────────────────────────────
  return Object.freeze({
    // Detection
    detect,
    detectAsync,
    getBrowserDisplayName,
    getStoreUrl,
    getNativeHostDirs,

    // Feature detection
    isFeatureAvailable,

    // Safe API wrappers
    safeNotify,
    safeDownloadOpen,
    safeResume,
    safePause,
    safeCancel,
    safeAlarmCreate,
    safeNativeMessage,
    closeAllWindows,

    // Storage
    storage,

    // Keep-alive
    connectKeepAlive,
    disconnectKeepAlive,

    // Utilities
    getExtensionURL,
    safeCall
  });
})();

// Export for service worker importScripts
if (typeof globalThis !== 'undefined') {
  globalThis.BrowserCompat = BrowserCompat;
}