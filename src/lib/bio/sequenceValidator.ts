import { RawParsedData, parseSequence } from './sequenceParser';
import { DetectionResult, detectSequence } from './sequenceDetector';
import { 
  SequenceType, 
  SequenceValidationDetails, 
  InvalidCharacterFindingDetail, 
  InvalidCharacterCategory 
} from './types';

// Standard Biological Alphabets
export const DNA_CANONICAL_SET = new Set(['A', 'C', 'G', 'T']);
export const DNA_IUPAC_SET = new Set([
  'A', 'C', 'G', 'T',
  'R', 'Y', 'S', 'W', 'K', 'M', 'B', 'D', 'H', 'V', 'N'
]);

export const RNA_CANONICAL_SET = new Set(['A', 'C', 'G', 'U']);
export const RNA_IUPAC_SET = new Set([
  'A', 'C', 'G', 'U',
  'R', 'Y', 'S', 'W', 'K', 'M', 'B', 'D', 'H', 'V', 'N'
]);

export const PROTEIN_STANDARD_20_SET = new Set([
  'A', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'K', 'L',
  'M', 'N', 'P', 'Q', 'R', 'S', 'T', 'V', 'W', 'Y',
  '*' // Translation stop
]);

export const PROTEIN_EXTENDED_SET = new Set([
  'A', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'K', 'L',
  'M', 'N', 'P', 'Q', 'R', 'S', 'T', 'V', 'W', 'Y',
  '*',
  'B', // Asx (Asp/Asn)
  'Z', // Glx (Glu/Gln)
  'J', // Xle (Leu/Ile)
  'X', // Any / Unknown amino acid
  'U', // Sec (Selenocysteine)
  'O'  // Pyl (Pyrrolysine)
]);

// Protein-exclusive characters that NEVER belong in DNA or RNA
export const PROTEIN_EXCLUSIVE_RESIDUES = new Set(['E', 'F', 'I', 'L', 'P', 'Q', 'Z', 'J', 'O']);

// Amino acid name map for human-readable feedback
const AMINO_ACID_NAMES: Record<string, string> = {
  A: 'Alanine (Ala)',
  C: 'Cysteine (Cys)',
  D: 'Aspartic acid (Asp)',
  E: 'Glutamic acid (Glu)',
  F: 'Phenylalanine (Phe)',
  G: 'Glycine (Gly)',
  H: 'Histidine (His)',
  I: 'Isoleucine (Ile)',
  K: 'Lysine (Lys)',
  L: 'Leucine (Leu)',
  M: 'Methionine (Met)',
  N: 'Asparagine (Asn)',
  P: 'Proline (Pro)',
  Q: 'Glutamine (Gln)',
  R: 'Arginine (Arg)',
  S: 'Serine (Ser)',
  T: 'Threonine (Thr)',
  V: 'Valine (Val)',
  W: 'Tryptophan (Trp)',
  Y: 'Tyrosine (Tyr)',
  '*': 'Stop codon (*)',
  B: 'Asparagine/Aspartate (Asx)',
  Z: 'Glutamine/Glutamate (Glx)',
  J: 'Leucine/Isoleucine (Xle)',
  X: 'Unknown amino acid (Xaa)',
  U: 'Selenocysteine (Sec)',
  O: 'Pyrrolysine (Pyl)'
};

export interface ValidationResult {
  isValid: boolean;
  validationErrors: string[];
  validationDetails?: SequenceValidationDetails;
}

/**
 * Detailed real-time sequence validator that identifies, categorizes, and coordinates
 * all non-nucleotide, non-protein, numeric, and symbolic characters in biological inputs.
 */
export function validateBiologicalSequence(
  rawInput: string,
  targetType?: SequenceType
): SequenceValidationDetails {
  if (!rawInput || !rawInput.trim()) {
    return {
      isValid: false,
      validationStatus: 'EMPTY',
      targetType: targetType || 'UNKNOWN',
      totalInvalidCount: 0,
      distinctInvalidCount: 0,
      invalidFindings: [],
      hasNumbers: false,
      hasSymbols: false,
      hasNonNucleotideChars: false,
      hasNonProteinChars: false,
      hasMixedTU: false,
      errors: ['Sequence input cannot be empty. Please enter or paste a biological sequence.'],
      warnings: [],
      sanitizedCleanSequence: '',
      sanitizedDnaSequence: '',
      sanitizedRnaSequence: '',
      sanitizedProteinSequence: '',
      validResidueCount: 0,
      totalInputLength: 0
    };
  }

  const parsed = parseSequence(rawInput);
  const detection = detectSequence(parsed.cleanedSequence, null, parsed.fastaHeader);
  const inferredType: SequenceType = targetType && targetType !== 'UNKNOWN' ? targetType : detection.detectedType;

  // Working sequence without FASTA header
  const seqToScan = parsed.unfilteredSequence;
  const errors: string[] = [];
  const warnings: string[] = [];

  const invalidFindingsMap = new Map<string, { positions: number[]; category: InvalidCharacterCategory; description: string }>();
  let totalInvalidCount = 0;
  let hasNumbers = false;
  let hasSymbols = false;
  let hasNonNucleotideChars = false;
  let hasNonProteinChars = false;

  // Track positions of T and U for mixed T/U detection
  const tPositions: number[] = [];
  const uPositions: number[] = [];

  for (let i = 0; i < seqToScan.length; i++) {
    const char = seqToScan[i];
    const pos = i + 1; // 1-based index

    if (char === 'T') tPositions.push(pos);
    if (char === 'U') uPositions.push(pos);

    let isInvalid = false;
    let category: InvalidCharacterCategory = 'UNRECOGNIZED';
    let description = `Unrecognized character '${char}'`;

    if (/[0-9]/.test(char)) {
      isInvalid = true;
      category = 'NUMERIC';
      description = `Numeric digit '${char}' (not a biological residue)`;
      hasNumbers = true;
    } else if (/[^A-Z*]/.test(char)) {
      isInvalid = true;
      category = 'SYMBOL';
      description = `Symbol / punctuation '${char}' (not a biological character)`;
      hasSymbols = true;
    } else {
      // Alphabetic character: check type-specific validity
      if (inferredType === 'DNA') {
        if (char === 'U') {
          isInvalid = true;
          category = 'MIXED_TU';
          description = `Uracil ('U') is an RNA base, invalid in DNA sequences`;
        } else if (!DNA_IUPAC_SET.has(char)) {
          isInvalid = true;
          category = 'NON_NUCLEOTIDE';
          hasNonNucleotideChars = true;
          const aaName = AMINO_ACID_NAMES[char];
          description = aaName 
            ? `Non-nucleotide residue '${char}' (${aaName}) is an amino acid, invalid in DNA sequence`
            : `Non-nucleotide character '${char}' is invalid in DNA sequence`;
        }
      } else if (inferredType === 'RNA') {
        if (char === 'T') {
          isInvalid = true;
          category = 'MIXED_TU';
          description = `T is a DNA base and is not valid for RNA under the selected RNA sequence type.`;
        } else if (!RNA_IUPAC_SET.has(char)) {
          isInvalid = true;
          category = 'NON_NUCLEOTIDE';
          hasNonNucleotideChars = true;
          const aaName = AMINO_ACID_NAMES[char];
          description = aaName 
            ? `Non-nucleotide residue '${char}' (${aaName}) is an amino acid, invalid in RNA sequence`
            : `Non-nucleotide character '${char}' is invalid in RNA sequence`;
        }
      } else if (inferredType === 'PROTEIN') {
        if (!PROTEIN_EXTENDED_SET.has(char)) {
          isInvalid = true;
          category = 'NON_PROTEIN';
          hasNonProteinChars = true;
          description = `Character '${char}' is not a recognized amino acid residue code`;
        }
      } else {
        // Unknown / unclassified: check if character is NEITHER a valid nucleotide NOR a valid protein residue
        const isNucleotide = DNA_IUPAC_SET.has(char) || RNA_IUPAC_SET.has(char);
        const isProtein = PROTEIN_EXTENDED_SET.has(char);

        if (!isNucleotide && !isProtein) {
          isInvalid = true;
          category = 'UNRECOGNIZED';
          description = `Character '${char}' is neither a known nucleotide nor an amino acid residue`;
        }
      }
    }

    if (isInvalid) {
      totalInvalidCount++;
      const existing = invalidFindingsMap.get(char);
      if (existing) {
        if (existing.positions.length < 50) {
          existing.positions.push(pos);
        }
      } else {
        invalidFindingsMap.set(char, {
          positions: [pos],
          category,
          description
        });
      }
    }
  }

  // Check for mixed T and U in general
  const hasMixedTU = tPositions.length > 0 && uPositions.length > 0;
  if (hasMixedTU && inferredType !== 'PROTEIN') {
    errors.push(
      `Biologically invalid: Sequence contains both Thymine ('T', ${tPositions.length}×) and Uracil ('U', ${uPositions.length}×). DNA and RNA alphabets cannot be combined.`
    );
  }

  // Format distinct findings
  const invalidFindings: InvalidCharacterFindingDetail[] = [];
  const CATEGORY_LABELS: Record<InvalidCharacterCategory, string> = {
    NUMERIC: 'Numeric Digit',
    SYMBOL: 'Symbol / Punctuation',
    NON_NUCLEOTIDE: 'Non-Nucleotide Residue',
    NON_PROTEIN: 'Non-Protein Character',
    MIXED_TU: 'Thymine/Uracil Conflict',
    WHITESPACE: 'Whitespace',
    UNRECOGNIZED: 'Unrecognized Character'
  };

  invalidFindingsMap.forEach((val, char) => {
    invalidFindings.push({
      char,
      count: val.positions.length,
      positions: val.positions,
      category: val.category,
      categoryLabel: CATEGORY_LABELS[val.category] || 'Invalid Character',
      description: val.description
    });
  });

  // Assemble human-readable error messages
  if (hasNumbers) {
    const numChars = invalidFindings.filter(f => f.category === 'NUMERIC').map(f => `'${f.char}'`).join(', ');
    errors.push(`Numeric characters (${numChars}) detected. Biological sequences must consist solely of nucleotide bases or amino acid residues.`);
  }

  if (hasSymbols) {
    const symChars = invalidFindings.filter(f => f.category === 'SYMBOL').map(f => `'${f.char}'`).join(', ');
    errors.push(`Non-biological symbols (${symChars}) detected. Punctuation and special characters cannot be processed by analysis pipelines.`);
  }

  if (hasNonNucleotideChars) {
    const nonNucChars = invalidFindings.filter(f => f.category === 'NON_NUCLEOTIDE').map(f => `'${f.char}'`).join(', ');
    errors.push(`Non-nucleotide residue(s) (${nonNucChars}) flagged in ${inferredType} sequence. Only nucleotide codes (A, C, G, T/U and IUPAC degenerates) are supported.`);
  }

  if (hasNonProteinChars) {
    const nonProtChars = invalidFindings.filter(f => f.category === 'NON_PROTEIN').map(f => `'${f.char}'`).join(', ');
    errors.push(`Non-protein character(s) (${nonProtChars}) flagged in protein sequence. Only standard and IUPAC amino acid residues are supported.`);
  }

  if (detection.isAmbiguous && inferredType === 'UNKNOWN') {
    warnings.push('Sequence is ambiguous (contains only overlapping A, C, G bases without distinguishing Thymine, Uracil, or amino acid residues).');
  }

  if (seqToScan.length === 0) {
    errors.push('No biological residues found in sequence.');
  }

  // Precompute sanitized variations for 1-click quick-fixes
  const sanitizedCleanSequence = seqToScan.replace(/[^A-Za-z*]/g, '').toUpperCase();
  const sanitizedDnaSequence = seqToScan
    .toUpperCase()
    .replace(/U/g, 'T') // Convert Uracil to Thymine
    .replace(/[^ACGTNRYWSKMBDHV]/g, '');

  const sanitizedRnaSequence = seqToScan
    .toUpperCase()
    .replace(/T/g, 'U') // Convert Thymine to Uracil
    .replace(/[^ACGUNRYWSKMBDHV]/g, '');

  const sanitizedProteinSequence = seqToScan
    .toUpperCase()
    .replace(/[^ACDEFGHIKLMNPQRSTVWY*BZJXUO]/g, '');

  const isValid = errors.length === 0 && totalInvalidCount === 0 && seqToScan.length > 0 && !hasMixedTU;
  const validationStatus = isValid 
    ? 'VALID' 
    : seqToScan.length === 0 
    ? 'EMPTY' 
    : warnings.length > 0 && errors.length === 0 
    ? 'WARNING' 
    : 'INVALID';

  return {
    isValid,
    validationStatus,
    targetType: inferredType,
    totalInvalidCount,
    distinctInvalidCount: invalidFindings.length,
    invalidFindings,
    hasNumbers,
    hasSymbols,
    hasNonNucleotideChars,
    hasNonProteinChars,
    hasMixedTU,
    mixedTUPositions: hasMixedTU ? { tPositions, uPositions } : undefined,
    errors,
    warnings,
    sanitizedCleanSequence,
    sanitizedDnaSequence,
    sanitizedRnaSequence,
    sanitizedProteinSequence,
    validResidueCount: seqToScan.length - totalInvalidCount,
    totalInputLength: seqToScan.length
  };
}

/**
 * Validates a parsed sequence against detected biological attributes.
 * Preserves compatibility with existing routeSequenceAutomation callers.
 */
export function validateSequence(
  parsed: RawParsedData,
  detection: DetectionResult,
  targetType?: SequenceType
): ValidationResult {
  const details = validateBiologicalSequence(parsed.rawInput, targetType || detection.detectedType);

  const errors: string[] = [...details.errors];

  // Check unknown sequence if not already flagged
  if (details.isValid && detection.detectedType === 'UNKNOWN' && !detection.isAmbiguous) {
    errors.push(detection.reason || 'Sequence could not be confidently verified as a known biological type (DNA, RNA, or Protein).');
  }

  return {
    isValid: errors.length === 0 && details.isValid,
    validationErrors: errors,
    validationDetails: details
  };
}
