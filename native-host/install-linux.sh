#!/bin/bash
# ═══════════════════════════════════════════════════════════
# Download Manager Pro — Native Host Installer (Linux)
# Supports: Chrome, Brave, Edge, Opera, Vivaldi, Chromium
# ═══════════════════════════════════════════════════════════

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
HOST_NAME="com.dlmanager.shutdown"
HOST_SCRIPT="$SCRIPT_DIR/shutdown_host.py"

# Colors
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'

echo "═══════════════════════════════════════════════════"
echo "  Download Manager Pro — Native Host Installer"
echo "═══════════════════════════════════════════════════"
echo

# Make script executable
chmod +x "$HOST_SCRIPT"

# Check Python
if ! command -v python3 &> /dev/null; then
    echo -e "${RED}Error: Python 3 is required but not found.${NC}"
    echo "Install with: sudo apt install python3"
    exit 1
fi

echo -e "${GREEN}✓${NC} Python 3 found: $(python3 --version)"

# Ask for Extension ID
echo
read -p "Enter your extension ID (from chrome://extensions): " EXT_ID

if [ -z "$EXT_ID" ]; then
    echo -e "${RED}Extension ID is required.${NC}"
    exit 1
fi

# Generate manifest
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

echo -e "${GREEN}✓${NC} Generated manifest"

# Browser directories
declare -A BROWSER_DIRS=(
  ["Google Chrome"]="$HOME/.config/google-chrome/NativeMessagingHosts"
  ["Brave"]="$HOME/.config/BraveSoftware/Brave-Browser/NativeMessagingHosts"
  ["Microsoft Edge"]="$HOME/.config/microsoft-edge/NativeMessagingHosts"
  ["Opera"]="$HOME/.config/opera/NativeMessagingHosts"
  ["Vivaldi"]="$HOME/.config/vivaldi/NativeMessagingHosts"
  ["Chromium"]="$HOME/.config/chromium/NativeMessagingHosts"
  ["Yandex"]="$HOME/.config/yandex-browser/NativeMessagingHosts"
)

INSTALLED=0

for BROWSER in "${!BROWSER_DIRS[@]}"; do
  DIR="${BROWSER_DIRS[$BROWSER]}"
  # Check if browser config dir exists (parent)
  PARENT_DIR="$(dirname "$DIR")"
  if [ -d "$PARENT_DIR" ]; then
    mkdir -p "$DIR"
    cp "$MANIFEST_FILE" "$DIR/"
    echo -e "${GREEN}✓${NC} Installed for $BROWSER"
    ((INSTALLED++))
  fi
done

echo
if [ $INSTALLED -eq 0 ]; then
  echo -e "${YELLOW}⚠ No browser config directories found.${NC}"
  echo "  You may need to install manually."
  echo "  Copy $MANIFEST_FILE to your browser's NativeMessagingHosts directory."
else
  echo -e "${GREEN}✓ Installed for $INSTALLED browser(s)${NC}"
fi

echo
echo "Restart your browser(s) for changes to take effect."
echo "═══════════════════════════════════════════════════"