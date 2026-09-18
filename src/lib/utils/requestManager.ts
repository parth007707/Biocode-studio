/**
 * Centralized Request Manager & Rate-Limit Strategy
 * 
 * Provides:
 * 1. Request deduplication (in-flight map by key)
 * 2. In-memory session caching with configurable TTL
 * 3. HTTP 429 / "Rate exceeded" detection & exponential backoff
 * 4. Cancellation (AbortSignal) awareness
 * 5. Cache invalidation helpers
 */

export interface RequestOptions {
  /** Unique key for deduplication and caching */
  key: string;
  /** Cache Time-To-Live in milliseconds (default: 30000ms = 30s). Set to 0 to skip cache read. */
  ttlMs?: number;
  /** Force fresh request, bypassing cache */
  forceRefresh?: boolean;
  /** Maximum number of retry attempts on rate-limit or transient errors (default: 2) */
  maxRetries?: number;
  /** Base delay in ms for exponential backoff (default: 1000ms) */
  initialBackoffMs?: number;
  /** Optional AbortSignal for cancellation */
  signal?: AbortSignal;
}

export interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

class RequestManager {
  private cache = new Map<string, CacheEntry<any>>();
  private inFlight = new Map<string, Promise<any>>();

  /**
   * Helper to check if an error is a Rate Limit (HTTP 429) error
   */
  public isRateLimitError(error: any): boolean {
    if (!error) return false;
    const msg = typeof error === 'string' ? error : error.message || error.details || error.hint || JSON.stringify(error);
    const status = error.status || error.statusCode || error.code;
    return (
      status === 429 ||
      status === '429' ||
      status === 'PGRST429' ||
      /rate\s*exceeded/i.test(msg) ||
      /too\s*many\s*requests/i.test(msg) ||
      /quota\s*exceeded/i.test(msg)
    );
  }

  /**
   * Executes a request with deduplication, session caching, rate-limit backoff, and error reporting.
   */
  public async execute<T>(
    fetcher: () => Promise<T>,
    options: RequestOptions
  ): Promise<T> {
    const {
      key,
      ttlMs = 30000,
      forceRefresh = false,
      maxRetries = 2,
      initialBackoffMs = 1000,
      signal
    } = options;

    // Check signal
    if (signal?.aborted) {
      throw new Error('Request aborted before execution');
    }

    // 1. Check Cache
    if (!forceRefresh && ttlMs > 0) {
      const cached = this.cache.get(key);
      if (cached && (Date.now() - cached.timestamp < ttlMs)) {
        return cached.data;
      }
    }

    // 2. Check In-Flight Request Deduplication
    if (this.inFlight.has(key) && !forceRefresh) {
      return this.inFlight.get(key)!;
    }

    // 3. Create execution promise with backoff
    const promise = (async () => {
      let attempt = 0;
      let currentBackoff = initialBackoffMs;

      while (true) {
        if (signal?.aborted) {
          throw new Error('Request aborted');
        }

        try {
          const data = await fetcher();
          // Store in cache if successful and TTL > 0
          if (ttlMs > 0) {
            this.cache.set(key, { data, timestamp: Date.now() });
          }
          return data;
        } catch (error: any) {
          attempt++;
          const isRateLimit = this.isRateLimitError(error);

          if (isRateLimit) {
            console.warn(`[RequestManager] Rate limit hit for key "${key}" (Attempt ${attempt}/${maxRetries + 1})`);
          }

          if (attempt <= maxRetries && isRateLimit) {
            const delay = currentBackoff + Math.random() * 200; // backoff with jitter
            console.log(`[RequestManager] Backing off for ${Math.round(delay)}ms before retry...`);
            await new Promise((res) => setTimeout(res, delay));
            currentBackoff *= 2;
            continue;
          }

          // If out of retries or non-retryable error, throw wrapped error
          if (isRateLimit) {
            const rateError = new Error('Rate exceeded. Please wait a moment before retrying.');
            (rateError as any).isRateLimit = true;
            (rateError as any).originalError = error;
            throw rateError;
          }

          throw error;
        }
      }
    })().finally(() => {
      this.inFlight.delete(key);
    });

    this.inFlight.set(key, promise);
    return promise;
  }

  /**
   * Invalidate cache entry or clear entire cache
   */
  public invalidateCache(keyPrefix?: string): void {
    if (!keyPrefix) {
      this.cache.clear();
      return;
    }
    for (const k of this.cache.keys()) {
      if (k.startsWith(keyPrefix)) {
        this.cache.delete(k);
      }
    }
  }

  /**
   * Manually set cache value
   */
  public setCache<T>(key: string, data: T): void {
    this.cache.set(key, { data, timestamp: Date.now() });
  }

  /**
   * Get cached entry if valid
   */
  public getCached<T>(key: string, ttlMs: number = 30000): T | null {
    const cached = this.cache.get(key);
    if (cached && (Date.now() - cached.timestamp < ttlMs)) {
      return cached.data;
    }
    return null;
  }
}

export const requestManager = new RequestManager();
