#!/bin/sh
set -e

if ! command -v apt >/dev/null 2>&1; then
  echo "This script expects apt (Raspberry Pi OS / Debian)."
  exit 1
fi

sudo apt update
sudo apt install -y \
  git \
  curl \
  ca-certificates \
  build-essential \
  python3-xdg \
  xserver-xorg \
  xinit \
  openbox \
  x11-xserver-utils \
  xinput \
  xrandr \
  chromium \
  unclutter

# Install NVM if missing
if [ ! -d "$HOME/.nvm" ]; then
  curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash
fi

# Load NVM
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"

# Install Node LTS if missing
if ! command -v node >/dev/null 2>&1; then
  nvm install --lts
  nvm use --lts
fi

# PM2
if ! command -v pm2 >/dev/null 2>&1; then
  npm install -g pm2
fi

