#!/usr/bin/env bash
set -euo pipefail

PUBLIC_IP=${1:-168.110.122.66}
SITE=/etc/nginx/sites-available/snsgod-grok
CERT=/etc/nginx/snsgod-oracle.crt
KEY=/etc/nginx/snsgod-oracle.key
TEMPLATE=/opt/snsgod-message/deploy/nginx-snsgod-grok-https.conf

if [[ ${EUID} -ne 0 ]]; then
  echo "Run with sudo: sudo bash oracle-enable-https.sh" >&2
  exit 1
fi
if [[ ! -f "${TEMPLATE}" ]]; then
  echo "HTTPS nginx template is missing: ${TEMPLATE}" >&2
  exit 1
fi

if [[ ! -f "${CERT}" || ! -f "${KEY}" ]]; then
  openssl req -x509 -nodes -newkey rsa:3072 -sha256 -days 3650 \
    -keyout "${KEY}" -out "${CERT}" \
    -subj "/CN=${PUBLIC_IP}/O=SNSGod Personal Server" \
    -addext "subjectAltName=IP:${PUBLIC_IP}" \
    -addext "basicConstraints=critical,CA:TRUE" \
    -addext "keyUsage=critical,digitalSignature,keyEncipherment,keyCertSign"
fi
chown root:root "${CERT}" "${KEY}"
chmod 0644 "${CERT}"
chmod 0600 "${KEY}"

if [[ -f "${SITE}" ]]; then
  cp -a "${SITE}" "${SITE}.before-https"
fi
sed "s/__PUBLIC_IP__/${PUBLIC_IP}/g" "${TEMPLATE}" > "${SITE}"
nginx -t
systemctl reload nginx

if ! iptables -C INPUT -p tcp --dport 443 -m conntrack --ctstate NEW -j ACCEPT 2>/dev/null; then
  reject_line=$(iptables -L INPUT --line-numbers -n | awk '$2 == "REJECT" { print $1; exit }')
  if [[ -n "${reject_line}" ]]; then
    iptables -I INPUT "${reject_line}" -p tcp --dport 443 -m conntrack --ctstate NEW -j ACCEPT
  else
    iptables -A INPUT -p tcp --dport 443 -m conntrack --ctstate NEW -j ACCEPT
  fi
fi
if command -v netfilter-persistent >/dev/null 2>&1; then
  netfilter-persistent save
fi

echo "HTTPS enabled for ${PUBLIC_IP}."
echo "Certificate: ${CERT}"
