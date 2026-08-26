// Platform configuration. Everything comes from env vars with dev-safe defaults.
import { randomBytes } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = dirname(dirname(fileURLToPath(import.meta.url))); // repo root

export function loadConfig(overrides = {}) {
  const env = { ...process.env, ...overrides };
  const dataDir = env.MX_DATA_DIR || join(ROOT, 'data');
  mkdirSync(dataDir, { recursive: true });

  // Persistent secret for session signing + BYOK encryption (generated once in dev).
  let secret = env.MX_SECRET;
  if (!secret) {
    const secretFile = join(dataDir, '.secret');
    if (existsSync(secretFile)) secret = readFileSync(secretFile, 'utf8').trim();
    else { secret = randomBytes(32).toString('hex'); writeFileSync(secretFile, secret, { mode: 0o600 }); }
  }

  const providerKeys = {
    openai: env.OPENAI_API_KEY || null,
    anthropic: env.ANTHROPIC_API_KEY || null,
    google: env.GEMINI_API_KEY || null,
    deepseek: env.DEEPSEEK_API_KEY || null,
    xai: env.XAI_API_KEY || null,
    moonshot: env.MOONSHOT_API_KEY || null,
    mistral: env.MISTRAL_API_KEY || null,
  };

  return {
    port: Number(env.MX_PORT || 8787),
    host: env.MX_HOST || '0.0.0.0',
    dataDir,
    dbFile: env.MX_DB_FILE || join(dataDir, 'modelaxis.db'),
    secret,
    providerKeys,
    // mock mode: serve every model from the deterministic mock provider.
    // Default ON unless at least one real provider key is configured or forced.
    mockOnly: env.MX_MOCK_ONLY != null
      ? env.MX_MOCK_ONLY === '1'
      : !Object.values(providerKeys).some(Boolean),
    signupCreditUsd: Number(env.MX_SIGNUP_CREDIT_USD || 5),
    devTopup: env.MX_DEV_TOPUP != null ? env.MX_DEV_TOPUP === '1' : !env.STRIPE_SECRET_KEY,
    stripeKey: env.STRIPE_SECRET_KEY || null,
    defaultRpm: Number(env.MX_DEFAULT_RPM || 600),
    siteDir: env.MX_SITE_DIR || join(ROOT, 'dist'),
    logRequests: env.MX_LOG != null ? env.MX_LOG === '1' : true,
  };
}
