param(
  [string]$Server = "168.110.122.66",
  [string]$User = "ubuntu",
  [Parameter(Mandatory = $true)]
  [string]$KeyPath
)

$ErrorActionPreference = "Stop"
$KeyPath = (Resolve-Path -LiteralPath $KeyPath).Path
$ServiceRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..")).Path
$Archive = Join-Path $env:TEMP "snsgod-message-release.tar.gz"

try {
  tar -C $ServiceRoot -czf $Archive src deploy package.json README.md
  ssh -i $KeyPath -o IdentitiesOnly=yes "${User}@${Server}" "rm -rf /tmp/snsgod-message-release && mkdir -p /tmp/snsgod-message-release"
  scp -i $KeyPath -o IdentitiesOnly=yes $Archive "${User}@${Server}:/tmp/snsgod-message-release.tar.gz"
  # Windows checkouts may contain CRLF shell scripts. Normalize only the staged
  # release copy before execution so Bash never interprets a trailing carriage return.
  ssh -i $KeyPath -o IdentitiesOnly=yes "${User}@${Server}" "tar -xzf /tmp/snsgod-message-release.tar.gz -C /tmp/snsgod-message-release && find /tmp/snsgod-message-release/deploy -type f -name '*.sh' -exec sed -i 's/\r$//' {} + && sudo bash /tmp/snsgod-message-release/deploy/oracle-install-safe.sh"
  ssh -i $KeyPath -o IdentitiesOnly=yes "${User}@${Server}" "curl -fsS http://127.0.0.1:8787/health"
} finally {
  Remove-Item -LiteralPath $Archive -Force -ErrorAction SilentlyContinue
}
