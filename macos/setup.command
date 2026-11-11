#!/bin/zsh
set -e
cd -- "${0:A:h}/.."
export PATH="/usr/local/bin:/opt/homebrew/bin:$PATH"
if ! command -v node >/dev/null 2>&1; then
  echo 'Install Node.js 22 or 24 LTS, then run setup.command again.'
  exit 1
fi
npm ci --ignore-scripts
npm run build
echo 'Setup complete. Double-click start.command in the macos folder.'
