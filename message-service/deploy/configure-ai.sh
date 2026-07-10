#!/usr/bin/env bash
set -euo pipefail

ENV_FILE=/etc/snsgod-message.env

if [[ ${EUID} -ne 0 ]]; then
  echo "Run with sudo: sudo bash configure-ai.sh" >&2
  exit 1
fi
if [[ ! -f "${ENV_FILE}" ]]; then
  echo "${ENV_FILE} does not exist. Install the service first." >&2
  exit 1
fi

read -r -p "OpenAI-compatible API URL [https://api.cerebras.ai/v1/chat/completions]: " API_URL
API_URL=${API_URL:-https://api.cerebras.ai/v1/chat/completions}
read -r -p "Model name: " MODEL
read -r -s -p "API key (hidden): " API_KEY
echo

if [[ -z "${MODEL}" || -z "${API_KEY}" ]]; then
  echo "Model and API key are required." >&2
  exit 1
fi

TMP=$(mktemp)
trap 'rm -f "${TMP}"' EXIT
grep -Ev '^(LLM_PROVIDER|LLM_API_URL|LLM_API_KEY|LLM_MODEL)=' "${ENV_FILE}" > "${TMP}"
{
  echo 'LLM_PROVIDER=openai-compatible'
  printf 'LLM_API_URL=%s\n' "${API_URL}"
  printf 'LLM_API_KEY=%s\n' "${API_KEY}"
  printf 'LLM_MODEL=%s\n' "${MODEL}"
} >> "${TMP}"
install -o root -g root -m 0600 "${TMP}" "${ENV_FILE}"
systemctl restart snsgod-message.service
sleep 2
systemctl --no-pager --full status snsgod-message.service
