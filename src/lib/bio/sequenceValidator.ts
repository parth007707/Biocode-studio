import { RawParsedData } from './sequenceParser';
import { DetectionResult } from './sequenceDetector';

export interface ValidationResult {
  isValid: boolean;
  validationErrors: string[];
}

export function validateSequence(
  parsed: RawParsedData,
  detection: DetectionResult
): ValidationResult {
  const errors: string[] = [];

  // Check empty input
  if (!parsed.rawInput.trim()) {
    errors.push('Sequence input cannot be empty.');
    return { isValid: false, validationErrors: errors };
  }

  if (parsed.cleanedSequence.length === 0) {
    errors.push('No valid biological sequence residues detected in the provided input.');
    return { isValid: false, validationErrors: errors };
  }

  // Check invalid characters (e.g., numbers, punctuation, non-amino/non-nucleotide symbols)
  if (parsed.hasInvalidChars) {
    const charsList = parsed.invalidChars.slice(0, 8).join(', ');
    errors.push(`Sequence contains invalid character(s): ${charsList}. Only standard biological IUPAC codes and amino acid characters are supported.`);
  }

  // Check mixed T and U
  if (detection.isMixedTU) {
    errors.push('Biologically invalid: Sequence contains both Thymine (T) and Uracil (U). DNA and RNA nucleotide alphabets cannot be combined.');
  }

  // Check ambiguous sequences
  if (detection.isAmbiguous) {
    errors.push('Sequence is ambiguous (contains only overlapping A, C, G bases without distinguishing Thymine, Uracil, or characteristic amino acid residues). Please provide additional context.');
  }

  // Check unknown or unclassifiable sequence
  if (detection.detectedType === 'UNKNOWN' && !detection.isMixedTU && !detection.isAmbiguous && !parsed.hasInvalidChars) {
    errors.push(detection.reason || 'Sequence could not be confidently verified as a known biological type (DNA, RNA, or Protein).');
  }

  return {
    isValid: errors.length === 0,
    validationErrors: errors
  };
}
