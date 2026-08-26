// Per-key token-bucket rate limiting (requests per minute), in memory.
const buckets = new Map();

export function checkRate(keyId, rpm) {
  const nowMs = Date.now();
  let b = buckets.get(keyId);
  if (!b) { b = { tokens: rpm, ts: nowMs }; buckets.set(keyId, b); }
  b.tokens = Math.min(rpm, b.tokens + ((nowMs - b.ts) / 60000) * rpm);
  b.ts = nowMs;
  if (b.tokens < 1) {
    const retryAfter = Math.ceil((1 - b.tokens) / (rpm / 60));
    return { limited: true, retryAfter };
  }
  b.tokens -= 1;
  return { limited: false };
}

export function resetRate(keyId) { buckets.delete(keyId); }
