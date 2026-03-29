#!/bin/sh
set -e

if [ -z "$REPO_URL" ]; then
  echo "REPO_URL is required"
  echo "Example: REPO_URL=git@github.com:you/zordex-pi-tool.git $0"
  exit 1
fi

INSTALL_DIR="${INSTALL_DIR:-$HOME/zordex-pi-tool}"

if [ ! -d "$INSTALL_DIR" ]; then
  git clone "$REPO_URL" "$INSTALL_DIR"
fi

sh "$INSTALL_DIR/scripts/setup.sh"
