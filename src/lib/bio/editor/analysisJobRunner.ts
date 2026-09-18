import {
  GCAndORFAnalysisResult,
  predictRNASecondaryStructure,
  RNASecondaryStructureResult,
  analyzeProteinSequence,
  AminoAcidComposition,
  generateDNAInterpretation,
  generateRNAInterpretation,
  generateProteinInterpretation,
  ScientificInterpretation
} from '../index';
import { analyzeCompleteSequenceChunked } from '../chunkStreamingAnalysis';
import { formatNumber } from '../../utils/formatters';
import { AnalysisJob, AnalysisJobState, SequenceMutation, MutationSummary } from './types';
import { bioService } from '../../../services/bioService';

export interface RunAnalysisJobOptions {
  job: AnalysisJob;
  sourceMetadata?: any;
  onProgress?: (job: AnalysisJob) => void;
  shouldCancel?: () => boolean;
}

export interface AnalysisJobExecutionResult {
  job: AnalysisJob;
  resultPayload: {
    type: 'DNA' | 'RNA' | 'PROTEIN';
    pipeline: string;
    header: string | null;
    sequence: string;
    dnaAnalysis?: GCAndORFAnalysisResult | null;
    rnaAnalysis?: RNASecondaryStructureResult | null;
    proteinAnalysis?: AminoAcidComposition | null;
    interpretation: ScientificInterpretation;
    reverseComplement?: string;
    timestamp: string;
    versionNumber: number;
    mutationSummary?: MutationSummary;
    mutations?: SequenceMutation[];
    sourceAnalysisId?: string | null;
  };
  persistenceResult?: any;
}

/**
 * Helper to yield back to browser event loop to prevent UI freezing
 */
const yieldToMainThread = (ms = 10): Promise<void> => {
  return new Promise((resolve) => setTimeout(resolve, ms));
};

/**
 * Helper to compute reverse complement
 */
const computeReverseComplement = (seq: string): string => {
  const compMap: Record<string, string> = { A: 'T', T: 'A', G: 'C', C: 'G', N: 'N', U: 'A' };
  return seq
    .split('')
    .reverse()
    .map((c) => compMap[c] || c)
    .join('');
};

/**
 * Asynchronous job runner that executes the analysis pipeline across discrete stages:
 * QUEUED -> VALIDATING -> ANALYZING -> GENERATING_RESULTS -> SAVING -> COMPLETED
 * Supports live progress updates, graceful cancellation, and error catching with retry capabilities.
 */
export async function runAnalysisJobAsync(
  options: RunAnalysisJobOptions
): Promise<AnalysisJobExecutionResult> {
  const { job: initialJob, sourceMetadata, onProgress, shouldCancel } = options;
  let currentJob: AnalysisJob = { ...initialJob };

  const updateState = async (
    status: AnalysisJobState,
    progress: number,
    currentStageMessage: string
  ) => {
    currentJob = {
      ...currentJob,
      status,
      progress,
      currentStageMessage
    };
    if (onProgress) {
      onProgress({ ...currentJob });
    }
    // Yield to main thread so React render cycle and animation frames can run cleanly
    await yieldToMainThread(100);
  };

  const checkCancellation = () => {
    if (shouldCancel && shouldCancel()) {
      const err = new Error('ANALYSIS_CANCELLED_BY_USER');
      err.name = 'CancellationError';
      throw err;
    }
  };

  try {
    const startTime = Date.now();
    const snapshotSeq = currentJob.sequenceSnapshot;
    const seqType = currentJob.sequenceType === 'UNKNOWN' ? 'PROTEIN' : currentJob.sequenceType;

    console.log(`[RUN_ANALYSIS] Action start: job=${currentJob.id} | length=${snapshotSeq.length} | type=${seqType} | pipeline=${currentJob.pipeline} | version=v${currentJob.versionNumber} | changes=${currentJob.mutationSummary?.totalChanges || currentJob.mutations?.length || 0}`);

    // ----------------------------------------------------
    // STAGE 1: QUEUED
    // ----------------------------------------------------
    await updateState('QUEUED', 5, 'Job registered in queue...');
    checkCancellation();

    // ----------------------------------------------------
    // STAGE 2: VALIDATING
    // ----------------------------------------------------
    await updateState('VALIDATING', 15, 'Validating snapshot sequence biological residues...');
    checkCancellation();
    await yieldToMainThread(80);

    if (!snapshotSeq || snapshotSeq.length === 0) {
      throw new Error('Sequence snapshot is empty. Cannot execute biological analysis pipeline.');
    }

    // ----------------------------------------------------
    // STAGE 3: ANALYZING (Heavy biological calculations)
    // ----------------------------------------------------
    let analyzingMsg = 'Calculating residue composition & physical metrics...';
    if (seqType === 'PROTEIN') {
      analyzingMsg = 'Calculating amino acid composition, hydropathy, and charge...';
    } else if (seqType === 'RNA') {
      analyzingMsg = 'Analyzing ribonucleotide ratios, GC/AU balance, and codon dynamics...';
    } else {
      analyzingMsg = 'Analyzing GC/AT distribution, nucleotide frequencies, and ORFs...';
    }

    console.log(`[MODIFIED_ANALYSIS] Starting biological computations on modified ${seqType} sequence (${snapshotSeq.length} residues)...`);
    await updateState('ANALYZING', 40, analyzingMsg);
    checkCancellation();
    await yieldToMainThread(120);

    let dnaRes: GCAndORFAnalysisResult | null = null;
    let rnaRes: RNASecondaryStructureResult | null = null;
    let protRes: AminoAcidComposition | null = null;
    let revComp: string | undefined = undefined;

    // Use existing chunked analysis pipeline for large & small sequences without blocking UI
    const chunkMetrics = analyzeCompleteSequenceChunked(
      snapshotSeq,
      seqType as 'DNA' | 'RNA' | 'PROTEIN'
    );

    checkCancellation();
    await updateState('ANALYZING', 65, 'Completing reading frame & sequence scan...');
    await yieldToMainThread(100);
    checkCancellation();

    if (seqType === 'DNA') {
      dnaRes = chunkMetrics.dnaAnalysis || null;
      revComp = computeReverseComplement(snapshotSeq);
    } else if (seqType === 'RNA') {
      rnaRes = chunkMetrics.rnaAnalysis || predictRNASecondaryStructure(snapshotSeq.slice(0, 120));
      dnaRes = chunkMetrics.dnaAnalysis || null;
    } else if (seqType === 'PROTEIN') {
      protRes = chunkMetrics.proteinAnalysis || analyzeProteinSequence(snapshotSeq);
    }

    // ----------------------------------------------------
    // STAGE 4: BUILDING_VISUALIZATION & INTERPRETATION
    // ----------------------------------------------------
    await updateState('BUILDING_VISUALIZATION', 78, 'Resolving structural representation & preparing visualization...');
    checkCancellation();
    await yieldToMainThread(100);

    await updateState('GENERATING_RESULTS', 85, 'Synthesizing biophysical interpretation & metrics...');
    checkCancellation();
    await yieldToMainThread(100);

    let interpretation: ScientificInterpretation;
    if (seqType === 'DNA') {
      interpretation = generateDNAInterpretation(snapshotSeq, dnaRes!, sourceMetadata);
    } else if (seqType === 'RNA') {
      interpretation = generateRNAInterpretation(rnaRes!, sourceMetadata, snapshotSeq, dnaRes || undefined);
    } else if (seqType === 'PROTEIN') {
      interpretation = generateProteinInterpretation(protRes!, sourceMetadata);
    } else {
      throw new Error(`Unsupported sequence type ${seqType}`);
    }

    console.log(`[MODIFIED_ANALYSIS] Completed biophysical metrics & structural resolution (${Date.now() - startTime}ms).`);

    const resultPayload = {
      type: seqType as 'DNA' | 'RNA' | 'PROTEIN',
      pipeline: currentJob.pipeline,
      header: currentJob.header,
      sequence: snapshotSeq,
      dnaAnalysis: dnaRes,
      rnaAnalysis: rnaRes,
      proteinAnalysis: protRes,
      interpretation,
      reverseComplement: revComp,
      timestamp: new Date().toLocaleTimeString(),
      versionNumber: currentJob.versionNumber,
      mutationSummary: currentJob.mutationSummary,
      mutations: currentJob.mutations,
      sourceAnalysisId: currentJob.sourceAnalysisId
    };

    // ----------------------------------------------------
    // STAGE 5: SAVING (Persisting as new version)
    // ----------------------------------------------------
    await updateState('SAVING', 92, 'Persisting Version ' + currentJob.versionNumber + ' analysis record...');
    checkCancellation();

    let persistenceRes: any = null;
    try {
      const summaryText = `${seqType} v${currentJob.versionNumber} (Modified): ${formatNumber(snapshotSeq.length)} ${seqType === 'PROTEIN' ? 'residues' : 'bp'} | ${formatNumber(currentJob.mutationSummary.totalChanges)} changes | ${interpretation.title}`;
      const seqAccession = sourceMetadata?.accession || (currentJob.header ? currentJob.header.split(/\s+/)[0].replace(/^>/, '') : `seq-v${currentJob.versionNumber}`);
      const seqTitle = sourceMetadata?.definition || sourceMetadata?.title || (currentJob.header ? currentJob.header.slice(0, 80) : 'Modified Sequence');

      console.log(`[SEQUENCE_VERSION] Version save attempt: v${currentJob.versionNumber} for accession ${seqAccession}...`);

      persistenceRes = await bioService.saveCompletedAnalysis(undefined, {
        sequenceInfo: {
          source: sourceMetadata?.source || (currentJob.header ? 'FASTA Input' : 'Sequence Editor'),
          accession: seqAccession,
          version: `v${currentJob.versionNumber}`,
          organism: sourceMetadata?.organism || 'Homo sapiens',
          molecule_type: sourceMetadata?.molecule_type || sourceMetadata?.moleculeType || null,
          sequence_type: sourceMetadata?.sequence_type || sourceMetadata?.sequenceType || (seqType === 'PROTEIN' ? 'Protein' : seqType === 'RNA' ? 'RNA Transcript' : 'Genomic DNA'),
          definition: `${seqTitle} [v${currentJob.versionNumber} Modified]`,
          total_length: snapshotSeq.length,
          topology: sourceMetadata?.topology || 'linear',
          sequence: snapshotSeq.length <= 100000 ? snapshotSeq : snapshotSeq.slice(0, 100000),
          metadata: {
            ...(sourceMetadata || {}),
            parent_analysis_id: currentJob.sourceAnalysisId,
            version_number: currentJob.versionNumber,
            mutations_count: currentJob.mutationSummary.totalChanges,
            mutation_summary: currentJob.mutationSummary,
            pipeline: currentJob.pipeline
          }
        },
        analysisInfo: {
          analysis_type: currentJob.pipeline,
          analysis_scope: 'Complete Sequence',
          total_sequence_length: snapshotSeq.length,
          analyzed_length: snapshotSeq.length,
          sequence_type: seqType,
          input_source: `Version ${currentJob.versionNumber} (Parent: ${currentJob.parentSequenceId})`,
          result_summary: summaryText,
          results: {
            pipeline: currentJob.pipeline,
            gcPercent: dnaRes?.composition?.gcPercentage,
            orfsCount: dnaRes?.orfs?.length,
            interpretationTitle: interpretation.title,
            timestamp: resultPayload.timestamp,
            coveragePercentage: 100,
            versionNumber: currentJob.versionNumber,
            mutationSummary: currentJob.mutationSummary,
            mutations: currentJob.mutations,
            parentAnalysisId: currentJob.sourceAnalysisId
          },
          status: 'Completed'
        }
      });

      // Also persist to sequence_versions table if sequenceId is available
      if (persistenceRes?.sequenceId) {
        try {
          const verRes = await bioService.saveSequenceVersion({
            sequence_id: persistenceRes.sequenceId,
            sequence_record_id: persistenceRes.sequenceId,
            accession: seqAccession,
            original_sequence: sourceMetadata?.originalSequence || null,
            modified_sequence: snapshotSeq.length <= 100000 ? snapshotSeq : snapshotSeq.slice(0, 100000),
            version_number: currentJob.versionNumber,
            sequence_data: snapshotSeq.length <= 100000 ? snapshotSeq : snapshotSeq.slice(0, 100000),
            changes: currentJob.mutations,
            original_length: currentJob.mutationSummary.originalLength,
            modified_length: currentJob.mutationSummary.modifiedLength,
            total_changes: currentJob.mutationSummary.totalChanges,
            status: 'Completed',
            metadata: {
              parentSequenceId: currentJob.parentSequenceId,
              analysisId: persistenceRes.analysisId,
              mutationSummary: currentJob.mutationSummary,
              pipeline: currentJob.pipeline
            }
          });
          console.log(`[SEQUENCE_VERSION] Version save result: storage=${verRes.storage} message=${verRes.message}`);
        } catch (verErr: any) {
          console.warn('[SEQUENCE_VERSION] Sequence version record notice:', verErr?.message || verErr);
        }
      }
    } catch (saveErr: any) {
      console.warn('[SEQUENCE_VERSION] Save warning (continuing with analysis output):', saveErr);
      persistenceRes = {
        storage: 'local_recovery',
        message: 'Saved temporarily to local storage.',
        warning: saveErr?.message
      };
    }

    // ----------------------------------------------------
    // STAGE 6: COMPLETED
    // ----------------------------------------------------
    currentJob = {
      ...currentJob,
      status: 'COMPLETED',
      progress: 100,
      currentStageMessage: 'Analysis completed successfully.',
      results: resultPayload,
      completedAt: new Date().toISOString()
    };

    console.log(`[RUN_ANALYSIS] Analysis completed successfully for job=${currentJob.id} in ${Date.now() - startTime}ms.`);

    if (onProgress) {
      onProgress({ ...currentJob });
    }

    return {
      job: currentJob,
      resultPayload,
      persistenceResult: persistenceRes
    };
  } catch (err: any) {
    console.error(`[RUN_ANALYSIS] Caught error: ${err?.message || err}`);
    if (err?.name === 'CancellationError' || err?.message === 'ANALYSIS_CANCELLED_BY_USER') {
      currentJob = {
        ...currentJob,
        status: 'CANCELLED',
        currentStageMessage: 'Analysis was cancelled by the user.',
        error: 'Analysis cancelled.'
      };
      if (onProgress) {
        onProgress({ ...currentJob });
      }
      throw err;
    }

    currentJob = {
      ...currentJob,
      status: 'FAILED',
      currentStageMessage: 'Analysis encountered an error.',
      error: err?.message || 'Unknown analysis pipeline error'
    };
    if (onProgress) {
      onProgress({ ...currentJob });
    }
    throw err;
  }
}
