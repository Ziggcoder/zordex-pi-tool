#!/bin/sh
set -e

SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"

# If running inside repo, use parent dir. Otherwise require REPO_URL.
if [ -d "$SCRIPT_DIR/../client" ] && [ -d "$SCRIPT_DIR/../server" ]; then
  REPO_DIR="$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)"
else
  if [ -z "$REPO_URL" ]; then
    echo "REPO_URL is required when running outside the repo"
    echo "Example: REPO_URL=git@github.com:you/zordex-pi-tool.git $0"
    exit 1
  fi
  INSTALL_DIR="${INSTALL_DIR:-$HOME/zordex-pi-tool}"
  if [ ! -d "$INSTALL_DIR" ]; then
    git clone "$REPO_URL" "$INSTALL_DIR"
  fi
  REPO_DIR="$INSTALL_DIR"
fi

# Install prerequisites
sh "$REPO_DIR/scripts/prereqs.sh"

# Load NVM for this shell
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"

# Install dependencies
npm --prefix "$REPO_DIR/server" install
npm --prefix "$REPO_DIR/client" install

# Build frontend
npm --prefix "$REPO_DIR/client" run build

# Install kiosk scripts
cp "$REPO_DIR/scripts/zordex-pi-tool-start.sh" "$HOME/zordex-pi-tool-start.sh"
chmod +x "$HOME/zordex-pi-tool-start.sh"

# Persist runtime config
cat > "$HOME/.zordex-pi-tool.env" <<EOF
REPO_DIR="$REPO_DIR"
DISPLAY_OUTPUT="${DISPLAY_OUTPUT:-SPI-1}"
APP_URL="${APP_URL:-http://localhost:3000}"
EOF

cat > "$HOME/.xinitrc" <<'XINIT'
#!/bin/sh
exec "$HOME/zordex-pi-tool-start.sh"
XINIT

chmod +x "$HOME/.xinitrc"

# Start PM2 and enable boot
PM2_BIN="$(command -v pm2)"
if [ -z "$PM2_BIN" ]; then
  echo "PM2 not found in PATH"
  exit 1
fi

pm2 start "$REPO_DIR/ecosystem.config.js"
pm2 save

sudo env PATH="$PATH" "$PM2_BIN" startup systemd -u "$USER" --hp "$HOME"

echo "Setup complete. Reboot to start kiosk."
