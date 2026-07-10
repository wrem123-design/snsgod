import { resolve } from 'node:path';

function requiredWhen(condition, name, value) {
  if (condition && !value) throw new Error(`${name} environment variable is required`);
  return value;
}

export function loadConfig(env = process.env) {
  const pushProvider = String(env.PUSH_PROVIDER || 'none').trim().toLowerCase();
  const llmProvider = String(env.LLM_PROVIDER || 'mock').trim().toLowerCase();
  const dataDir = resolve(String(env.DATA_DIR || './data'));
  const boundedNumber = (value, fallback, min, max) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback;
  };
  const config = {
    host: String(env.HOST || '127.0.0.1'),
    port: Number(env.PORT || 8787),
    dataDir,
    profilePrivateKeyPath: resolve(String(env.PROFILE_PRIVATE_KEY_PATH || `${dataDir}/profile-private.pem`)),
    bootstrapSecret: String(env.BOOTSTRAP_SECRET || ''),
    llmProvider,
    llmApiUrl: String(env.LLM_API_URL || '').trim(),
    llmApiKey: String(env.LLM_API_KEY || '').trim(),
    llmModel: String(env.LLM_MODEL || '').trim(),
    grokApiUrl: String(env.GROK_TEXT_API_URL || 'http://127.0.0.1:5000/api/xai-proxy/v1/chat/completions').trim(),
    apiHealthCheckMs: boundedNumber(env.API_HEALTH_CHECK_SECONDS, 300, 30, 3600) * 1000,
    replyJobRetentionMs: boundedNumber(env.REPLY_JOB_RETENTION_HOURS, 24, 1, 168) * 60 * 60 * 1000,
    proactiveJobRetentionMs: boundedNumber(env.PROACTIVE_JOB_RETENTION_HOURS, 6, 1, 24) * 60 * 60 * 1000,
    allowInsecureConfigSync: String(env.ALLOW_INSECURE_CONFIG_SYNC || '').trim().toLowerCase() === 'true',
    pushProvider,
    firebaseServiceAccountPath: String(env.FIREBASE_SERVICE_ACCOUNT_PATH || '').trim()
  };
  if (!Number.isInteger(config.port) || config.port < 1 || config.port > 65535) throw new Error('PORT must be a valid TCP port');
  requiredWhen(!config.bootstrapSecret, 'BOOTSTRAP_SECRET', config.bootstrapSecret);
  if (llmProvider !== 'mock' && llmProvider !== 'openai-compatible') {
    throw new Error('LLM_PROVIDER must be mock or openai-compatible');
  }
  requiredWhen(llmProvider === 'openai-compatible', 'LLM_API_URL', config.llmApiUrl);
  requiredWhen(llmProvider === 'openai-compatible', 'LLM_API_KEY', config.llmApiKey);
  if (pushProvider !== 'none' && pushProvider !== 'fcm') throw new Error('PUSH_PROVIDER must be none or fcm');
  requiredWhen(pushProvider === 'fcm', 'FIREBASE_SERVICE_ACCOUNT_PATH', config.firebaseServiceAccountPath);
  return config;
}
