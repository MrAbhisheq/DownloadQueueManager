document.addEventListener('DOMContentLoaded', () => {

  // ── Read branding from messages.json ──
  function i18n(key, fallback) {
    try { return chrome.i18n.getMessage(key) || fallback; }
    catch { return fallback; }
  }

  const baseName = i18n('extBaseName', 'Download Manager');
  const suffix   = i18n('extSuffix',   '');
  const fullName = i18n('extName',     'Download Manager Pro');
  const tagline  = i18n('extTagline',  'You\'re all set!');

  // Header
  const nameEl   = document.getElementById('welcome-brand-name');
  const suffixEl = document.getElementById('welcome-brand-suffix');

  if (nameEl) nameEl.textContent = baseName;

  if (suffixEl && suffix && suffix.trim().length > 0) {
    suffixEl.textContent = suffix.trim();
    suffixEl.classList.remove('hidden');
  }

  // Page title
  document.getElementById('page-title').textContent = `Welcome — ${fullName}`;

  // Tagline
  document.getElementById('welcome-tagline').textContent = tagline;

  // Browser detection
  const tag = document.getElementById('browser-tag');
  if (typeof BrowserCompat !== 'undefined') {
    tag.textContent = `Running on ${BrowserCompat.getBrowserDisplayName()}`;
  } else {
    const ua = navigator.userAgent;
    if (ua.includes('Edg/'))         tag.textContent = 'Running on Microsoft Edge';
    else if (ua.includes('Brave'))   tag.textContent = 'Running on Brave';
    else if (ua.includes('OPR/'))    tag.textContent = 'Running on Opera';
    else if (ua.includes('Vivaldi')) tag.textContent = 'Running on Vivaldi';
    else                             tag.textContent = 'Running on Chrome';
  }

  document.getElementById('btn-close').addEventListener('click', () => window.close());
});