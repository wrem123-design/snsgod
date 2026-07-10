#!/usr/bin/env bash
set -euo pipefail

if [[ ${EUID} -ne 0 ]]; then
  echo "Run with sudo: sudo show-pairing-secret.sh" >&2
  exit 1
fi
grep '^BOOTSTRAP_SECRET=' /etc/snsgod-message.env | cut -d= -f2-
