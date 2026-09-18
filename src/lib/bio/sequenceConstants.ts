/**
 * Sequence Size Constants and Configurable Performance Thresholds
 */

export const SEQUENCE_THRESHOLDS = {
  /**
   * SMALL (0 - 100,000 bp/aa):
   * Full single-pass processing allowed directly.
   */
  SMALL: 100_000,

  /**
   * MEDIUM (100,000 - 5,000,000 bp/aa):
   * Requires chunked streaming and windowed visualization.
   */
  MEDIUM: 5_000_000,

  /**
   * LARGE (5,000,000 - 50,000,000 bp/aa):
   * Requires background Web Workers, streaming chunk pipeline, and LOD viewports.
   */
  LARGE: 50_000_000,

  /**
   * VERY LARGE (50,000,000+ bp/aa):
   * Strictly windowed analysis; never load raw sequence into single state buffer.
   */
  VERY_LARGE: 50_000_001
} as const;

export type SequenceScale = 'SMALL' | 'MEDIUM' | 'LARGE' | 'VERY_LARGE';

/**
 * Determine the scale tier for a given biological sequence length
 */
export function getSequenceScaleCategory(length: number): SequenceScale {
  if (length <= SEQUENCE_THRESHOLDS.SMALL) return 'SMALL';
  if (length <= SEQUENCE_THRESHOLDS.MEDIUM) return 'MEDIUM';
  if (length <= SEQUENCE_THRESHOLDS.LARGE) return 'LARGE';
  return 'VERY_LARGE';
}

/**
 * Default display and analysis window sizes
 */
export const WINDOW_CONFIG = {
  DEFAULT_DISPLAY_WINDOW: 25_000, // Characters to render in DOM viewport at once
  MIN_WINDOW_SIZE: 5_000,
  MAX_WINDOW_SIZE: 100_000,
  ANALYSIS_CHUNK_SIZE: 50_000,
  MAX_IN_MEMORY_CHARS: 250_000
} as const;
