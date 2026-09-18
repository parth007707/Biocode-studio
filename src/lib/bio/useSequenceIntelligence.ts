import { useState, useMemo } from 'react';
import {
  SequenceIntelligenceResult,
  SequenceType,
  VisualizationMode,
  EngineType,
  AnalysisPipelineType
} from './types';
import { routeSequenceAutomation } from './automationRouter';
import { SequenceSourceMetadata } from '../../services/adapters/types';

export interface UseSequenceIntelligenceReturn {
  rawInput: string;
  setRawInput: (input: string) => void;
  result: SequenceIntelligenceResult;
  detectedType: SequenceType;
  visualizationMode: VisualizationMode;
  engine: EngineType;
  availableAnalyses: AnalysisPipelineType[];
  isValid: boolean;
  validationErrors: string[];
  confidence: number;
  length: number;
  fastaHeader: string | null;
  cleanedSequence: string;
  updateSequence: (input: string) => void;
  metadata?: SequenceSourceMetadata | null;
  biologicalClassification?: {
    molecule_type: string;
    sequence_type: string;
    strand: string;
    topology: string;
  };
}

export function useSequenceIntelligence(
  initialInput: string = '',
  sourceMetadata?: SequenceSourceMetadata | null
): UseSequenceIntelligenceReturn {
  const [rawInput, setRawInput] = useState<string>(initialInput);

  const result: SequenceIntelligenceResult = useMemo(() => {
    return routeSequenceAutomation(rawInput, sourceMetadata);
  }, [rawInput, sourceMetadata]);

  return {
    rawInput,
    setRawInput,
    result,
    detectedType: result.detectedType,
    visualizationMode: result.visualizationMode,
    engine: result.engine,
    availableAnalyses: result.availableAnalyses,
    isValid: result.isValid,
    validationErrors: result.validationErrors,
    confidence: result.confidence,
    length: result.length,
    fastaHeader: result.fastaHeader,
    cleanedSequence: result.cleanedSequence,
    updateSequence: setRawInput,
    metadata: result.metadata,
    biologicalClassification: result.biologicalClassification
  };
}
