#!/bin/zsh
set -e
cd -- "${0:A:h}/.."
export PATH="/usr/local/bin:/opt/homebrew/bin:$PATH"
npm run configure
