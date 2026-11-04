/**
 * Central Request Management & Concurrency Control Utility
 * Features:
 * - Concurrency queues with priorities (interactive search: 3, metadata: 2, heavy analysis: 1)
 * - Request deduplication for identical in-flight requests
 * - In-memory cache with TTL (separate for metadata and sequence chunks)
 * - Exponential backoff retry on transient HTTP codes (429, 502, 503, 504)
 * - Timeout enforcement via AbortController
 * - Unified state tracking and queue telemetry
 */

export type RequestState = 
  | 'idle' 
  | 'loading' 
  | 'streaming' 
  | 'processing' 
  | 'success' 
  | 'error' 
  | 'cancelled';

export type RequestPriority = 'interactive' | 'metadata' | 'analysis';

export interface RequestOptions {
  priority?: RequestPriority;
  timeoutMs?: number;
  maxRetries?: number;
  cacheTtlMs?: number;
  deduplicate?: boolean;
  signal?: AbortSignal;
}

interface QueuedTask<T> {
  id: string;
  key: string;
  priority: RequestPriority;
  execute: (signal: AbortSignal) => Promise<T>;
  resolve: (value: T | PromiseLike<T>) => void;
  reject: (reason?: any) => void;
  timeoutMs: number;
  maxRetries: number;
  retriesRemaining: number;
  abortController: AbortController;
  userSignal?: AbortSignal;
}

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
  sizeBytes: number;
}

export interface QueueTelemetry {
  activeInteractive: number;
  activeMetadata: number;
  activeAnalysis: number;
  queuedInteractive: number;
  queuedMetadata: number;
  queuedAnalysis: number;
  totalCompleted: number;
  totalFailed: number;
  cacheItemCount: number;
}

class RequestManager {
  // Max concurrency limits per priority tier
  private concurrencyLimits: Record<RequestPriority, number> = {
    interactive: 3,
    metadata: 2,
    analysis: 1
  };

  private activeCounts: Record<RequestPriority, number> = {
    interactive: 0,
    metadata: 0,
    analysis: 0
  };

  private queues: Record<RequestPriority, QueuedTask<any>[]> = {
    interactive: [],
    metadata: [],
    analysis: []
  };

  // In-flight deduplication map: key -> Promise
  private inFlightMap = new Map<string, Promise<any>>();

  // In-memory cache: key -> CacheEntry
  private cache = new Map<string, CacheEntry<any>>();

  // Telemetry counters
  private totalCompleted = 0;
  private totalFailed = 0;
  private listeners = new Set<(telemetry: QueueTelemetry) => void>();

  // Tagged abort controllers (e.g. for cancelling previous search query tag)
  private groupControllers = new Map<string, AbortController>();

  constructor() {
    // Run cache cleanup every 60s
    if (typeof window !== 'undefined') {
      setInterval(() => this.purgeExpiredCache(), 60_000);
    }
  }

  /**
   * Subscribe to queue telemetry updates
   */
  public subscribeTelemetry(listener: (telemetry: QueueTelemetry) => void): () => void {
    this.listeners.add(listener);
    listener(this.getTelemetry());
    return () => this.listeners.delete(listener);
  }

  private notifyTelemetry() {
    if (this.listeners.size === 0) return;
    const telemetry = this.getTelemetry();
    this.listeners.forEach(fn => {
      try {
        fn(telemetry);
      } catch {}
    });
  }

  public getTelemetry(): QueueTelemetry {
    return {
      activeInteractive: this.activeCounts.interactive,
      activeMetadata: this.activeCounts.metadata,
      activeAnalysis: this.activeCounts.analysis,
      queuedInteractive: this.queues.interactive.length,
      queuedMetadata: this.queues.metadata.length,
      queuedAnalysis: this.queues.analysis.length,
      totalCompleted: this.totalCompleted,
      totalFailed: this.totalFailed,
      cacheItemCount: this.cache.size
    };
  }

  /**
   * Cancel all pending/in-flight requests associated with a group tag
   * e.g. "ncbi-search", "blast-search"
   */
  public cancelGroup(groupTag: string) {
    const existing = this.groupControllers.get(groupTag);
    if (existing) {
      existing.abort();
      this.groupControllers.delete(groupTag);
    }
    const newController = new AbortController();
    this.groupControllers.set(groupTag, newController);
    return newController.signal;
  }

  /**
   * Primary enqueue method
   */
  public async execute<T>(
    key: string,
    fetcher: (signal: AbortSignal) => Promise<T>,
    options: RequestOptions = {}
  ): Promise<T> {
    const priority = options.priority || 'interactive';
    const timeoutMs = options.timeoutMs ?? (priority === 'analysis' ? 120_000 : 25_000);
    const maxRetries = options.maxRetries ?? (priority === 'analysis' ? 0 : 2);
    const cacheTtlMs = options.cacheTtlMs ?? 0;
    const deduplicate = options.deduplicate ?? true;

    // 1. Check in-memory cache
    if (cacheTtlMs > 0) {
      const cached = this.cache.get(key);
      if (cached && cached.expiresAt > Date.now()) {
        return cached.data as T;
      }
    }

    // 2. Check in-flight deduplication
    if (deduplicate && this.inFlightMap.has(key)) {
      return this.inFlightMap.get(key) as Promise<T>;
    }

    // 3. Create execution promise
    const promise = new Promise<T>((resolve, reject) => {
      const abortController = new AbortController();

      // If external signal provided, link abort
      if (options.signal) {
        if (options.signal.aborted) {
          abortController.abort();
          reject(new DOMException('Aborted', 'AbortError'));
          return;
        }
        options.signal.addEventListener('abort', () => abortController.abort(), { once: true });
      }

      const task: QueuedTask<T> = {
        id: Math.random().toString(36).substring(2, 9),
        key,
        priority,
        execute: fetcher,
        resolve: (val) => {
          if (cacheTtlMs > 0) {
            this.setCache(key, val, cacheTtlMs);
          }
          resolve(val);
        },
        reject,
        timeoutMs,
        maxRetries,
        retriesRemaining: maxRetries,
        abortController,
        userSignal: options.signal
      };

      this.queues[priority].push(task);
      this.processQueue(priority);
      this.notifyTelemetry();
    });

    if (deduplicate) {
      this.inFlightMap.set(key, promise);
      promise.finally(() => {
        this.inFlightMap.delete(key);
      }).catch(() => {});
    }

    return promise;
  }

  private processQueue(priority: RequestPriority) {
    const limit = this.concurrencyLimits[priority];
    while (this.activeCounts[priority] < limit && this.queues[priority].length > 0) {
      const task = this.queues[priority].shift()!;
      this.runTask(task);
    }
  }

  private async runTask<T>(task: QueuedTask<T>) {
    this.activeCounts[task.priority]++;
    this.notifyTelemetry();

    let timeoutId: any = null;
    if (task.timeoutMs > 0) {
      timeoutId = setTimeout(() => {
        task.abortController.abort('Request timed out');
      }, task.timeoutMs);
    }

    try {
      if (task.abortController.signal.aborted) {
        throw new DOMException('Aborted', 'AbortError');
      }

      const result = await task.execute(task.abortController.signal);
      if (timeoutId) clearTimeout(timeoutId);
      
      this.totalCompleted++;
      task.resolve(result);
    } catch (err: any) {
      if (timeoutId) clearTimeout(timeoutId);

      const isAborted = err.name === 'AbortError' || task.abortController.signal.aborted;
      const isTransient = this.isTransientError(err);

      // Exponential backoff retry for transient network / rate-limit failures
      if (!isAborted && isTransient && task.retriesRemaining > 0) {
        const attempt = task.maxRetries - task.retriesRemaining + 1;
        const delayMs = Math.min(1000 * Math.pow(2, attempt), 6000);
        task.retriesRemaining--;

        setTimeout(() => {
          this.queues[task.priority].unshift(task);
          this.activeCounts[task.priority]--;
          this.processQueue(task.priority);
        }, delayMs);
        return;
      }

      this.totalFailed++;
      task.reject(err);
    } finally {
      this.activeCounts[task.priority]--;
      this.processQueue(task.priority);
      this.notifyTelemetry();
    }
  }

  private isTransientError(err: any): boolean {
    if (!err) return false;
    const msg = err.message || '';
    if (msg.includes('429') || msg.includes('502') || msg.includes('503') || msg.includes('504') || msg.includes('Failed to fetch') || msg.includes('NetworkError')) {
      return true;
    }
    return false;
  }

  public setCache<T>(key: string, data: T, ttlMs: number) {
    if (this.cache.size > 200) {
      this.purgeExpiredCache();
      if (this.cache.size > 200) {
        // Drop oldest 50 items
        const keys = Array.from(this.cache.keys()).slice(0, 50);
        keys.forEach(k => this.cache.delete(k));
      }
    }
    this.cache.set(key, {
      data,
      expiresAt: Date.now() + ttlMs,
      sizeBytes: typeof data === 'string' ? data.length : 1024
    });
  }

  public getCache<T>(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) return null;
    if (entry.expiresAt <= Date.now()) {
      this.cache.delete(key);
      return null;
    }
    return entry.data as T;
  }

  public clearCache() {
    this.cache.clear();
  }

  private purgeExpiredCache() {
    const now = Date.now();
    for (const [key, entry] of this.cache.entries()) {
      if (entry.expiresAt <= now) {
        this.cache.delete(key);
      }
    }
  }
}

export const requestManager = new RequestManager();
