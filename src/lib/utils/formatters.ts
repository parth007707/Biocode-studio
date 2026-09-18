/**
 * Safe numeric formatting utility that never throws when formatting values for UI display.
 * Handles number | null | undefined | NaN | Infinity safely.
 */
export function formatNumber(
  value: number | string | null | undefined,
  fallback: string = '0'
): string {
  if (value === null || value === undefined) {
    return fallback;
  }
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
      return fallback;
    }
    return parsed.toLocaleString();
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      return fallback;
    }
    return value.toLocaleString();
  }
  return fallback;
}
