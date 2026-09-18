import { useState, useEffect, useCallback, useRef } from 'react';
import { requestManager, RequestOptions } from '../lib/utils/requestManager';

export interface UseStableAsyncResult<T> {
  data: T | null;
  loading: boolean;
  error: Error | null;
  isRateLimited: boolean;
  refetch: (forceRefresh?: boolean) => Promise<T | null>;
  setData: React.Dispatch<React.SetStateAction<T | null>>;
}

/**
 * Hook for executing deduplicated async fetchers safely with cancellation and rate-limit states.
 */
export function useStableAsync<T>(
  fetcher: (signal?: AbortSignal) => Promise<T>,
  options: RequestOptions & { enabled?: boolean },
  deps: any[] = []
): UseStableAsyncResult<T> {
  const { enabled = true, key, ttlMs = 30000, forceRefresh = false, maxRetries = 2 } = options;
  const [data, setData] = useState<T | null>(() => requestManager.getCached<T>(key, ttlMs));
  const [loading, setLoading] = useState<boolean>(!data && enabled);
  const [error, setError] = useState<Error | null>(null);
  const [isRateLimited, setIsRateLimited] = useState<boolean>(false);

  const abortControllerRef = useRef<AbortController | null>(null);

  const executeFetch = useCallback(async (manualForceRefresh = false): Promise<T | null> => {
    if (!enabled) return null;

    // Abort previous in-flight request for this component instance
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setLoading(true);
    setError(null);
    setIsRateLimited(false);

    try {
      const result = await requestManager.execute(
        () => fetcher(controller.signal),
        {
          key,
          ttlMs,
          forceRefresh: manualForceRefresh || forceRefresh,
          maxRetries,
          signal: controller.signal
        }
      );

      if (!controller.signal.aborted) {
        setData(result);
        setLoading(false);
      }
      return result;
    } catch (err: any) {
      if (controller.signal.aborted) {
        return null;
      }
      const isRate = requestManager.isRateLimitError(err) || err.isRateLimit;
      setIsRateLimited(isRate);
      setError(err instanceof Error ? err : new Error(String(err)));
      setLoading(false);
      return null;
    }
  }, [enabled, key, ttlMs, forceRefresh, maxRetries, ...deps]);

  useEffect(() => {
    if (enabled) {
      executeFetch(false);
    }
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [executeFetch, enabled]);

  return {
    data,
    loading,
    error,
    isRateLimited,
    refetch: executeFetch,
    setData
  };
}
