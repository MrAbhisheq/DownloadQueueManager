#!/bin/bash
# ═══════════════════════════════════════════════════════════
# Download Manager Pro — Native Host Installer (macOS)
# Supports: Chrome, Brave, Edge, Opera, Vivaldi, Chromium
# ═══════════════════════════════════════════════════════════

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
HOST_NAME="com.dlmanager.shutdown"
HOST_SCRIPT="$SCRIPT_DIR/shutdown_host.py"

echo "═══════════════════════════════════════════════════"
echo "  Download Manager Pro — Native Host Installer"
echo "═══════════════════════════════════════════════════"
echo

chmod +x "$HOST_SCRIPT"

if ! command -v python3 &> /dev/null; then
    echo "Error: Python 3 is required."
    exit 1
fi

echo "✓ Python 3 found: $(python3 --version)"
echo

read -p "Enter your extension ID: " EXT_ID
if [ -z "$EXT_ID" ]; then
    echo "Extension ID is required."
    exit 1
fi

MANIFEST_FILE="$SCRIPT_DIR/$HOST_NAME.json"
cat > "$MANIFEST_FILE" << EOF
{
  "name": "$HOST_NAME",
  "description": "Shutdown helper for Download Manager Pro",
  "path": "$HOST_SCRIPT",
  "type": "stdio",
  "allowed_origins": [
    "chrome-extension://$EXT_ID/"
  ]
}
EOF

echo "✓ Generated manifest"

APP_SUPPORT="$HOME/Library/Application Support"

declare -a BROWSER_DIRS=(
  "Google/Chrome/NativeMessagingHosts"
  "BraveSoftware/Brave-Browser/NativeMessagingHosts"
  "Microsoft Edge/NativeMessagingHosts"
  "com.operasoftware.Opera/NativeMessagingHosts"
  "Vivaldi/NativeMessagingHosts"
  "Chromium/NativeMessagingHosts"
)

INSTALLED=0

for REL_DIR in "${BROWSER_DIRS[@]}"; do
  FULL_DIR="$APP_SUPPORT/$REL_DIR"
  PARENT_DIR="$(dirname "$FULL_DIR")"
  if [ -d "$PARENT_DIR" ]; then
    mkdir -p "$FULL_DIR"
    cp "$MANIFEST_FILE" "$FULL_DIR/"
    BROWSER_NAME=$(echo "$REL_DIR" | cut -d'/' -f1)
    echo "✓ Installed for $BROWSER_NAME"
    ((INSTALLED++))
  fi
done

echo
echo "✓ Installed for $INSTALLED browser(s)"
echo "Restart your browser(s) for changes to take effect."