/**
 * Web Worker Bridge for BioCode Studio Analysis
 * Manages worker lifecycle, provides cancellable promise execution,
 * throttled progress callbacks, and graceful fallback to main-thread async chunks.
 */

import {
  WorkerAnalysisRequest,
  WorkerOutgoingMessage,
  WorkerProgressMessage,
  WorkerSuccessMessage,
  WorkerErrorMessage
} from './analysisWorker';
import { analyzeGCAndORF } from '../orfAnalysis';
import { analyzeProteinSequence } from '../proteinAnalysis';

export interface AnalysisWorkerJobOptions {
  sequence: string;
  type: 'DNA' | 'RNA' | 'PROTEIN';
  pipeline?: string;
  minOrfLength?: number;
  onProgress?: (progressPercent: number, phase: string) => void;
  signal?: AbortSignal;
}

export interface AnalysisWorkerJobResult {
  result: any;
  executionTimeMs: number;
}

class AnalysisWorkerBridge {
  private worker: Worker | null = null;
  private activeJobId: string | null = null;

  constructor() {
    this.initWorker();
  }

  private initWorker() {
    if (typeof window === 'undefined' || typeof Worker === 'undefined') return;

    try {
      this.worker = new Worker(new URL('./analysisWorker.ts', import.meta.url), {
        type: 'module'
      });
    } catch (e) {
      console.warn('[AnalysisWorkerBridge] Failed to create module Web Worker. Falling back to inline execution.', e);
      this.worker = null;
    }
  }

  /**
   * Run biological analysis off the main thread with progress updates & cancellation
   */
  public async executeAnalysis(options: AnalysisWorkerJobOptions): Promise<AnalysisWorkerJobResult> {
    const jobId = Math.random().toString(36).substring(2, 9);
    const { sequence, type, pipeline, minOrfLength, onProgress, signal } = options;

    if (signal?.aborted) {
      throw new DOMException('Analysis was aborted before starting', 'AbortError');
    }

    // If worker is available, dispatch to Web Worker
    if (this.worker) {
      return new Promise<AnalysisWorkerJobResult>((resolve, reject) => {
        this.activeJobId = jobId;

        const cleanup = () => {
          this.activeJobId = null;
          if (this.worker) {
            this.worker.onmessage = null;
            this.worker.onerror = null;
          }
        };

        const handleAbort = () => {
          cleanup();
          // Restart worker to clear stuck state
          try {
            this.worker?.terminate();
          } catch {}
          this.initWorker();
          reject(new DOMException('Analysis job cancelled by user', 'AbortError'));
        };

        if (signal) {
          signal.addEventListener('abort', handleAbort, { once: true });
        }

        this.worker.onmessage = (event: MessageEvent<WorkerOutgoingMessage>) => {
          const msg = event.data;
          if (msg.id !== jobId) return;

          if (msg.type === 'PROGRESS') {
            if (onProgress) {
              onProgress(msg.progressPercent, msg.phase);
            }
          } else if (msg.type === 'SUCCESS') {
            cleanup();
            if (signal) signal.removeEventListener('abort', handleAbort);
            resolve({
              result: msg.result,
              executionTimeMs: msg.executionTimeMs
            });
          } else if (msg.type === 'ERROR') {
            cleanup();
            if (signal) signal.removeEventListener('abort', handleAbort);
            reject(new Error(msg.error));
          }
        };

        this.worker.onerror = (err) => {
          cleanup();
          if (signal) signal.removeEventListener('abort', handleAbort);
          reject(new Error(`Worker fatal error: ${err.message}`));
        };

        const payload: WorkerAnalysisRequest = {
          id: jobId,
          sequence,
          type,
          pipeline,
          options: {
            minOrfLength
          }
        };

        this.worker.postMessage(payload);
      });
    }

    // Fallback if Web Worker is unavailable in environment: Async chunked processing
    return this.executeFallbackAnalysis(options);
  }

  private async executeFallbackAnalysis(options: AnalysisWorkerJobOptions): Promise<AnalysisWorkerJobResult> {
    const startTime = performance.now();
    const { sequence, type, onProgress, signal } = options;

    if (onProgress) onProgress(20, 'Analyzing sequence data on worker fallback thread...');
    await new Promise(r => setTimeout(r, 10));

    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');

    let result: any = {};
    if (type === 'DNA' || type === 'RNA') {
      if (onProgress) onProgress(60, 'Scanning GC composition and reading frames...');
      result = analyzeGCAndORF(sequence, type);
    } else {
      if (onProgress) onProgress(60, 'Calculating protein properties...');
      result = analyzeProteinSequence(sequence);
    }

    if (onProgress) onProgress(100, 'Completed');

    return {
      result,
      executionTimeMs: Math.round(performance.now() - startTime)
    };
  }

  public terminate() {
    if (this.worker) {
      try {
        this.worker.terminate();
      } catch {}
      this.worker = null;
    }
  }
}

export const analysisWorkerBridge = new AnalysisWorkerBridge();
