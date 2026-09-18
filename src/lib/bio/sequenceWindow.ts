/**
 * Sequence Window & Chunk Management Architecture
 * Allows navigating, slicing, and rendering huge sequences (e.g. 23M bp)
 * without ever placing the entire string in React state or DOM.
 */

import { WINDOW_CONFIG, getSequenceScaleCategory, SequenceScale } from './sequenceConstants';

export interface SequenceChunk {
  sequenceRecordId: string;
  chunkIndex: number;
  startPosition: number; // 1-based start
  endPosition: number;   // 1-based inclusive end
  content: string;
  totalLength: number;
}

export interface SequenceWindowSlice {
  start: number;         // 1-based start
  end: number;           // 1-based inclusive end
  totalLength: number;
  content: string;
  windowSize: number;
  scale: SequenceScale;
  hasNext: boolean;
  hasPrev: boolean;
  totalPages: number;
  currentPage: number;
}

/**
 * Creates a window slice from a sequence or partial chunk buffer
 */
export function createSequenceWindow(
  content: string,
  totalLength: number,
  startPosition: number = 1,
  windowSize: number = WINDOW_CONFIG.DEFAULT_DISPLAY_WINDOW
): SequenceWindowSlice {
  const safeTotal = Math.max(totalLength, content.length, 1);
  const safeWindow = Math.max(WINDOW_CONFIG.MIN_WINDOW_SIZE, Math.min(windowSize, WINDOW_CONFIG.MAX_WINDOW_SIZE));
  
  const safeStart = Math.max(1, Math.min(startPosition, safeTotal));
  const safeEnd = Math.min(safeTotal, safeStart + safeWindow - 1);
  
  // If we have local content buffer, slice the relevant window
  // (Handling whether content is 0-indexed offset from startPosition or 0-indexed full string)
  let windowContent = '';
  if (content.length > 0) {
    if (content.length >= safeTotal) {
      // Content is the full sequence
      windowContent = content.slice(safeStart - 1, safeEnd);
    } else {
      // Content is a chunk already
      windowContent = content.slice(0, safeEnd - safeStart + 1);
    }
  }

  const totalPages = Math.ceil(safeTotal / safeWindow);
  const currentPage = Math.ceil(safeStart / safeWindow);

  return {
    start: safeStart,
    end: safeEnd,
    totalLength: safeTotal,
    content: windowContent,
    windowSize: safeWindow,
    scale: getSequenceScaleCategory(safeTotal),
    hasNext: safeEnd < safeTotal,
    hasPrev: safeStart > 1,
    totalPages,
    currentPage
  };
}

/**
 * Calculates chunk coordinates for streaming downloads
 */
export function calculateChunkRanges(
  totalLength: number,
  chunkSize: number = WINDOW_CONFIG.ANALYSIS_CHUNK_SIZE
): Array<{ chunkIndex: number; start: number; end: number }> {
  const chunks: Array<{ chunkIndex: number; start: number; end: number }> = [];
  let start = 1;
  let index = 0;

  while (start <= totalLength) {
    const end = Math.min(totalLength, start + chunkSize - 1);
    chunks.push({ chunkIndex: index, start, end });
    start += chunkSize;
    index++;
  }

  return chunks;
}
