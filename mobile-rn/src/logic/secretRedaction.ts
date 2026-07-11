/** Redacts common credential shapes before diagnostic text reaches storage. */
export function redactSecretText(message: string): string {
  return String(message || '')
    .replace(/-----BEGIN [^-]*PRIVATE KEY-----[\s\S]*?-----END [^-]*PRIVATE KEY-----/gi, '[REDACTED PRIVATE KEY]')
    .replace(/\bBearer\s+[A-Za-z0-9._~+\/-]+=*/gi, 'Bearer [REDACTED]')
    .replace(/((?:["'])(?:apiKey|serviceAccountJson|private_key|proxyAccessToken|pairingSecret|deviceToken|x-device-token)(?:["'])\s*:\s*)"(?:\\.|[^"\\])*"/gi, '$1"[REDACTED]"')
    .replace(/((?:["'])apiKeys(?:["'])\s*:\s*)\[[^\]]*\]/gi, '$1["[REDACTED]"]')
    .replace(/(\b(?:apiKey|proxyAccessToken|pairingSecret|deviceToken|x-device-token)\b\s*[=:]\s*)[^\s,;]+/gi, '$1[REDACTED]');
}
