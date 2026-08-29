# Publishing Guide — Download Manager Pro

## Pre-Flight Checklist

- [ ] Generate icons using `icon-generator.html` → save to `icons/`
- [ ] Test on at least 2 browsers (Chrome + one other)
- [ ] Take screenshots (1280×800 recommended)
- [ ] Prepare promotional images (optional but recommended)
- [ ] Host privacy policy at a public URL
- [ ] Verify all features work correctly

## Creating the ZIP Package

```bash
# From the project root
zip -r download-manager-pro.zip \
  manifest.json \
  compat.js \
  background.js \
  popup.html \
  popup.css \
  popup.js \
  welcome.html \
  welcome.css \
  welcome.js \
  _locales/ \
  icons/ \
  -x "*.DS_Store" "icon-generator.html" "native-host/*" \
     "PUBLISHING.md" "README.md" "store-assets/*"
```

---

## 1. Chrome Web Store

**URL:** https://chrome.google.com/webstore/devconsole

### Steps:
1. Pay one-time **$5 registration fee**
2. Go to Developer Dashboard → **New Item**
3. Upload `download-manager-pro.zip`
4. Fill in listing details:
   - **Name:** Download Manager Pro
   - **Summary:** Download triggers, auto-resume & smart queue for power users
   - **Category:** Productivity
   - **Language:** English
5. Upload screenshots (min 1, recommend 3-5)
6. Provide **Privacy Policy URL**
7. Under Practices tab:
   - Single purpose: "Manage browser downloads with triggers, auto-resume, and queueing"
   - Permissions justification (fill each one)
8. Submit for review (1-3 business days)

### Notes:
- Brave & Vivaldi users install from Chrome Web Store
- Also works for Arc, Yandex, and other Chromium browsers

---

## 2. Microsoft Edge Add-ons

**URL:** https://partner.microsoft.com/en-us/dashboard/microsoftedge/overview

### Steps:
1. Sign up with Microsoft account (free)
2. Go to Edge Add-ons Dashboard → **Create new extension**
3. Upload the **same ZIP** file
4. Fill in listing:
   - **Name:** Download Manager Pro
   - **Description:** Same as Chrome listing
   - **Category:** Productivity
5. Upload Edge-specific screenshots (if desired)
6. Provide Privacy Policy URL
7. Submit for review (2-7 business days)

### Edge-Specific Notes:
- Edge accepts the exact same Manifest V3 format
- No code changes needed
- Edge may take longer to review than Chrome
- Edge supports `setBadgeTextColor` (we handle this in compat.js)

---

## 3. Opera Add-ons

**URL:** https://addons.opera.com/developer/

### Steps:
1. Create Opera Developer account (free)
2. Go to Developer Portal → **Add new extension**
3. Upload the ZIP file
4. Fill in listing details
5. Opera may request additional info:
   - Detailed description of each permission
   - Screenshots specific to Opera
6. Submit for review (3-7 business days)

### Opera-Specific Notes:
- Opera accepts Chrome extensions with minimal changes
- The `opr` namespace is detected by our compat layer
- Opera's review may be stricter about permissions

---

## 4. Brave

Brave uses the **Chrome Web Store** directly. Once published on Chrome
Web Store, Brave users can install it from there.

However, Brave has **Shields** which may interfere:
- Notifications may be blocked by default
- Our compat layer handles this gracefully
- Users may need to allow notifications in Brave settings

---

## 5. Vivaldi

Vivaldi also uses the **Chrome Web Store**. No separate submission needed.

---

## Store Listing Copy

### Title (45 chars max for Edge)
```
Download Manager Pro
```

### Short Description (132 chars)
```
Set completion triggers, auto-resume failed downloads, and manage a smart 
download queue with concurrent limits.
```

### Full Description
```
🚀 Take control of your downloads with Download Manager Pro.

⚡ COMPLETION TRIGGERS
Set an action on any active download — when it completes, your action 
fires automatically:
• 🔔 Desktop notification
• 📂 Open the downloaded file  
• 🌐 Navigate to a URL
• ▶️ Resume another paused download
• ⬇️ Start a new download
• 🚪 Close the browser
• ⏻ Shutdown your PC (requires free native helper)

🔄 AUTO-RESUME ON FAILURE
• Automatically retries interrupted downloads
• Configurable retry limit (1-20) and delay (3-60 seconds)  
• One-click global toggle to enable/disable
• Smart error detection — won't retry unrecoverable errors

📋 SMART DOWNLOAD QUEUE
• Set max simultaneous downloads (1-10)
• Excess downloads are automatically paused and queued
• Next download starts when a slot opens
• Reorder queue priority with up/down controls

🌐 CROSS-BROWSER
Works on Chrome, Edge, Brave, Opera, Vivaldi, and other 
Chromium-based browsers.

🔒 PRIVACY FIRST
• Zero data collection
• No external servers
• No analytics or tracking
• Everything stays on your device

💡 OPEN SOURCE
```

### Permission Justifications (for store review)

| Permission | Justification |
|---|---|
| `downloads` | Core functionality: monitor download progress, detect completion/failure, manage queue |
| `downloads.open` | Trigger action: open completed file when user sets "Open File" trigger |
| `storage` | Store user settings, trigger configurations, and queue state locally |
| `notifications` | Alert users when downloads complete, fail, or when triggers fire |
| `alarms` | Schedule automatic retry timers for failed downloads and periodic queue management |