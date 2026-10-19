import { LRUCache } from 'lru-cache';

// Startup assertion checking process.env.REPLICA_COUNT === '1'
export function assertReplicaTopology(): void {
  const replicaCount = process.env.REPLICA_COUNT;
  if (replicaCount !== '1') {
    const error = new Error(
      `ERR_INVALID_REPLICA_TOPOLOGY: In-memory rate limiting is only valid and safe when REPLICA_COUNT is exactly '1'. Found: '${replicaCount}'`
    );
    error.name = 'ERR_INVALID_REPLICA_TOPOLOGY';
    throw error;
  }
}

// Execute assertion on module import
assertReplicaTopology();

interface RateLimitRecord {
  count: number;
  resetAt: number;
}

const limiterCache = new LRUCache<string, RateLimitRecord>({
  max: 10000,
  ttl: 60 * 1000, // 60 seconds
});

export function checkRateLimit(
  key: string,
  maxRequests = 10,
  windowMs = 60 * 1000
): { allowed: boolean; remaining: number; resetAt: number } {
  const now = Date.now();
  const existing = limiterCache.get(key);

  if (!existing || now > existing.resetAt) {
    const newRecord: RateLimitRecord = {
      count: 1,
      resetAt: now + windowMs,
    };
    limiterCache.set(key, newRecord);
    return { allowed: true, remaining: maxRequests - 1, resetAt: newRecord.resetAt };
  }

  if (existing.count >= maxRequests) {
    return { allowed: false, remaining: 0, resetAt: existing.resetAt };
  }

  existing.count++;
  limiterCache.set(key, existing);
  return { allowed: true, remaining: maxRequests - existing.count, resetAt: existing.resetAt };
}
