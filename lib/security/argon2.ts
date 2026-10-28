import argon2 from '@node-rs/argon2';
import { logger } from '@/lib/telemetry/logger';

/**
 * T012 / FR-504a: Secure Argon2id foundation with in-process queue mutex,
 * depth limit (max 10 waiting), and acquisition timeout (5000ms → 503 Service Busy).
 * Prevents memory exhaustion and Head-of-Line blocking under concurrent auth storms.
 */

const MIN_MEMORY_KIB = 19456; // OWASP floor (19 MiB)
const MIN_TIME_COST = 2;
const MAX_QUEUE_DEPTH = 10;
const ACQUISITION_TIMEOUT_MS = 5000;

class Argon2MutexQueue {
  private queue: Array<{
    resolve: () => void;
    reject: (err: Error) => void;
    timer: NodeJS.Timeout;
  }> = [];
  private locked = false;

  async acquire(): Promise<void> {
    if (!this.locked) {
      this.locked = true;
      return;
    }

    if (this.queue.length >= MAX_QUEUE_DEPTH) {
      throw new Error('Service Busy: Argon2 auth queue overloaded (503)');
    }

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        // Remove from queue on timeout
        const idx = this.queue.findIndex((item) => item.resolve === resolve);
        if (idx !== -1) {
          this.queue.splice(idx, 1);
        }
        reject(new Error('Service Busy: Argon2 mutex acquisition timeout (503)'));
      }, ACQUISITION_TIMEOUT_MS);

      this.queue.push({ resolve, reject, timer });
    });
  }

  release(): void {
    const next = this.queue.shift();
    if (next) {
      clearTimeout(next.timer);
      next.resolve();
    } else {
      this.locked = false;
    }
  }
}

const argon2Mutex = new Argon2MutexQueue();

function getArgon2Options() {
  const memoryCost = Number(process.env.ARGON2_M_KIB) || 65536;
  const timeCost = Number(process.env.ARGON2_T) || 3;
  const parallelism = Number(process.env.ARGON2_P) || 4;

  if (memoryCost < MIN_MEMORY_KIB || timeCost < MIN_TIME_COST) {
    throw new Error(`Invalid Argon2 parameters: memoryCost=${memoryCost} (min ${MIN_MEMORY_KIB}), timeCost=${timeCost} (min ${MIN_TIME_COST})`);
  }

  return {
    memoryCost,
    timeCost,
    parallelism,
    outputLen: 32,
  };
}

/**
 * Hashes a plain-text password using Argon2id with mutex serialization and resource bounds.
 */
export async function hashPasswordArgon2id(plainPassword: string): Promise<string> {
  await argon2Mutex.acquire();
  try {
    const opts = getArgon2Options();
    const hash = await argon2.hash(plainPassword, {
      algorithm: 1, // Argon2id algorithm constant in @node-rs/argon2
      memoryCost: opts.memoryCost,
      timeCost: opts.timeCost,
      parallelism: opts.parallelism,
      outputLen: opts.outputLen,
    });
    return hash;
  } catch (err: unknown) {
    logger.error('[ARGON2_HASH_FAILED]', { error: String(err) });
    throw err;
  } finally {
    argon2Mutex.release();
  }
}

/**
 * Verifies a plain-text password against an Argon2id PHC hash string.
 */
export async function verifyPasswordArgon2id(hash: string, plainPassword: string): Promise<boolean> {
  await argon2Mutex.acquire();
  try {
    return await argon2.verify(hash, plainPassword);
  } catch (err: unknown) {
    logger.error('[ARGON2_VERIFY_FAILED]', { error: String(err) });
    return false;
  } finally {
    argon2Mutex.release();
  }
}
