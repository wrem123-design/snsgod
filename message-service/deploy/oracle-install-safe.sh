#!/usr/bin/env bash
set -euo pipefail

APP_DIR=/opt/snsgod-message
DATA_DIR=/var/lib/snsgod-message
ENV_FILE=/etc/snsgod-message.env
SERVICE_USER=snsgod-msg
RELEASE_DIR=${1:-/tmp/snsgod-message-release}
NODE_VERSION=22.17.0
NODE_HOME=/opt/snsgod-node

if [[ ${EUID} -ne 0 ]]; then
  echo "Run with sudo: sudo bash oracle-install-safe.sh" >&2
  exit 1
fi
if [[ ! -f "${RELEASE_DIR}/src/index.mjs" ]]; then
  echo "Release files were not found in ${RELEASE_DIR}" >&2
  exit 1
fi

# Install an isolated, checksum-verified Node runtime. This does not replace the
# system Node version used by an existing Grok/image service.
if [[ ! -x "${NODE_HOME}/bin/node" ]]; then
  case "$(uname -m)" in
    aarch64|arm64) NODE_ARCH=arm64 ;;
    x86_64|amd64) NODE_ARCH=x64 ;;
    *) echo "Unsupported CPU architecture: $(uname -m)" >&2; exit 1 ;;
  esac
  apt-get update
  apt-get install -y ca-certificates curl xz-utils
  TMP_NODE=$(mktemp -d)
  trap 'rm -rf "${TMP_NODE}"' EXIT
  NODE_FILE="node-v${NODE_VERSION}-linux-${NODE_ARCH}.tar.xz"
  curl -fsSLo "${TMP_NODE}/${NODE_FILE}" "https://nodejs.org/dist/v${NODE_VERSION}/${NODE_FILE}"
  curl -fsSLo "${TMP_NODE}/SHASUMS256.txt" "https://nodejs.org/dist/v${NODE_VERSION}/SHASUMS256.txt"
  (cd "${TMP_NODE}" && grep " ${NODE_FILE}$" SHASUMS256.txt | sha256sum -c -)
  install -d -o root -g root -m 0755 "${NODE_HOME}"
  tar -xJf "${TMP_NODE}/${NODE_FILE}" --strip-components=1 -C "${NODE_HOME}"
  rm -rf "${TMP_NODE}"
  trap - EXIT
fi

if ! id "${SERVICE_USER}" >/dev/null 2>&1; then
  useradd --system --home-dir "${DATA_DIR}" --shell /usr/sbin/nologin "${SERVICE_USER}"
fi

install -d -o root -g root -m 0755 "${APP_DIR}"
install -d -o "${SERVICE_USER}" -g "${SERVICE_USER}" -m 0750 "${DATA_DIR}"
PROFILE_PRIVATE_KEY="${DATA_DIR}/profile-private.pem"
PROFILE_PUBLIC_KEY="${DATA_DIR}/profile-public.pem"
if [[ ! -f "${PROFILE_PRIVATE_KEY}" ]]; then
  openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:3072 -out "${PROFILE_PRIVATE_KEY}"
fi
openssl pkey -in "${PROFILE_PRIVATE_KEY}" -pubout -out "${PROFILE_PUBLIC_KEY}"
chown "${SERVICE_USER}:${SERVICE_USER}" "${PROFILE_PRIVATE_KEY}" "${PROFILE_PUBLIC_KEY}"
chmod 0600 "${PROFILE_PRIVATE_KEY}"
chmod 0644 "${PROFILE_PUBLIC_KEY}"
rm -rf "${APP_DIR}/src" "${APP_DIR}/deploy" "${APP_DIR}/package.json"
cp -a "${RELEASE_DIR}/src" "${APP_DIR}/src"
cp -a "${RELEASE_DIR}/deploy" "${APP_DIR}/deploy"
cp -a "${RELEASE_DIR}/package.json" "${APP_DIR}/package.json"
chown -R root:root "${APP_DIR}"

if [[ ! -f "${ENV_FILE}" ]]; then
  SECRET=$(openssl rand -hex 32)
  cat > "${ENV_FILE}" <<EOF
BOOTSTRAP_SECRET=${SECRET}
HOST=127.0.0.1
PORT=8787
DATA_DIR=${DATA_DIR}
PROFILE_PRIVATE_KEY_PATH=${DATA_DIR}/profile-private.pem
LLM_PROVIDER=mock
LLM_API_URL=
LLM_API_KEY=
LLM_MODEL=
GROK_TEXT_API_URL=http://127.0.0.1:5000/api/xai-proxy/v1/chat/completions
API_HEALTH_CHECK_SECONDS=300
REPLY_JOB_RETENTION_HOURS=24
PROACTIVE_JOB_RETENTION_HOURS=6
ALLOW_INSECURE_CONFIG_SYNC=false
PUSH_PROVIDER=none
FIREBASE_SERVICE_ACCOUNT_PATH=
EOF
  chmod 0600 "${ENV_FILE}"
fi

install -o root -g root -m 0644 "${RELEASE_DIR}/deploy/snsgod-message-safe.service" /etc/systemd/system/snsgod-message.service
systemctl daemon-reload
systemctl enable snsgod-message.service
systemctl restart snsgod-message.service

echo
echo "Installed SNSGod message service with an isolated Node runtime."
echo "Local health check: curl http://127.0.0.1:8787/health"
echo "Configure AI safely: sudo bash ${APP_DIR}/deploy/configure-ai.sh"
echo "Show the phone pairing secret: sudo ${APP_DIR}/deploy/show-pairing-secret.sh"
