import { useState, useMemo, useEffect, useCallback } from 'react';
import {
  SequenceIntelligenceResult,
  SequenceType,
  VisualizationMode,
  EngineType,
  AnalysisPipelineType,
  SequenceValidationDetails
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
  validationDetails?: SequenceValidationDetails;
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
  sourceMetadata?: SequenceSourceMetadata | null,
  canonicalType?: SequenceType
): UseSequenceIntelligenceReturn {
  const [rawInput, setRawInput] = useState<string>(initialInput);

  // Synchronize internal rawInput whenever a new sequence is loaded into the workbench
  useEffect(() => {
    setRawInput(initialInput);
  }, [initialInput]);

  const updateSequence = useCallback((input: string) => {
    setRawInput(input);
  }, []);

  const result: SequenceIntelligenceResult = useMemo(() => {
    return routeSequenceAutomation(rawInput, sourceMetadata, canonicalType);
  }, [rawInput, sourceMetadata, canonicalType]);

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
    validationDetails: result.validationDetails,
    confidence: result.confidence,
    length: result.length,
    fastaHeader: result.fastaHeader,
    cleanedSequence: result.cleanedSequence,
    updateSequence,
    metadata: result.metadata,
    biologicalClassification: result.biologicalClassification
  };
}
