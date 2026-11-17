export interface ParsedBiologicalInput {
  header: string;
  sequence: string;
}

export function parseBiologicalInput(rawInput: string): ParsedBiologicalInput {
  if (!rawInput || typeof rawInput !== 'string') {
    return { header: '', sequence: '' };
  }

  const lines = rawInput.split(/\r?\n/);

  let header = "";
  let sequenceLines = lines;

  if (lines[0]?.trim().startsWith(">")) {
    header = lines[0].trim().substring(1);
    sequenceLines = lines.slice(1);
  }

  const sequence = sequenceLines
    .filter(line => !line.trim().startsWith('>'))
    .join("")
    .replace(/\s+/g, "")
    .toUpperCase();

  return {
    header,
    sequence
  };
}

export interface RawParsedData {
  rawInput: string;
  fastaHeader: string | null;
  cleanedSequence: string;
  unfilteredSequence: string;
  rawSequenceLines: string[];
  hasInvalidChars: boolean;
  invalidChars: string[];
  charPositionMap: Record<string, number[]>;
}

export function parseSequence(input: string): RawParsedData {
  if (!input || typeof input !== 'string') {
    return {
      rawInput: '',
      fastaHeader: null,
      cleanedSequence: '',
      unfilteredSequence: '',
      rawSequenceLines: [],
      hasInvalidChars: false,
      invalidChars: [],
      charPositionMap: {}
    };
  }

  const lines = input.split(/\r?\n/);
  let fastaHeader: string | null = null;
  const rawSequenceLines: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (trimmed.startsWith('>')) {
      if (!fastaHeader) {
        // Extract FASTA header beginning with >
        fastaHeader = trimmed.substring(1).trim();
      }
    } else {
      rawSequenceLines.push(trimmed);
    }
  }

  const combinedRaw = rawSequenceLines.join('');
  // Remove whitespace and convert to uppercase
  const upperCaseRaw = combinedRaw.replace(/\s+/g, '').toUpperCase();

  // Identify any non-alphabetic characters (or characters outside standard biological letters and *)
  const invalidCharsFound: string[] = [];
  const charPositionMap: Record<string, number[]> = {};

  for (let i = 0; i < upperCaseRaw.length; i++) {
    const char = upperCaseRaw[i];
    const pos = i + 1; // 1-based index
    if (!charPositionMap[char]) {
      charPositionMap[char] = [];
    }
    if (charPositionMap[char].length < 100) {
      charPositionMap[char].push(pos);
    }

    if (!/[A-Z*]/.test(char)) {
      if (!invalidCharsFound.includes(char)) {
        invalidCharsFound.push(char);
      }
    }
  }

  // Filter cleaned sequence to only standard biological letters and *
  const cleanedSequence = upperCaseRaw.replace(/[^A-Z*]/g, '');

  return {
    rawInput: input,
    fastaHeader,
    cleanedSequence,
    unfilteredSequence: upperCaseRaw,
    rawSequenceLines,
    hasInvalidChars: invalidCharsFound.length > 0,
    invalidChars: invalidCharsFound,
    charPositionMap
  };
}

export function parseFasta(input: string): { header: string | null; sequence: string } {
  const parsed = parseSequence(input);
  return {
    header: parsed.fastaHeader,
    sequence: parsed.cleanedSequence
  };
}

export interface FastaValidationResult {
  header: string;
  sequence: string;
  isValid: boolean;
  type: 'PROTEIN' | 'DNA' | 'RNA' | 'UNKNOWN';
  length: number;
  invalidCharacters: string[];
  errorMessage?: string;
}

const PROTEIN_ALLOWED_REGEX = /^[ACDEFGHIKLMNPQRSTVWYBZX*]+$/;
const DNA_ALLOWED_REGEX = /^[ACGTUNRYKMSWBDHV]+$/;
const RNA_ALLOWED_REGEX = /^[ACGTUNRYKMSWBDHV]+$/;

/**
 * Strict FASTA parsing and biological validation
 * - Ignores FASTA header line (>...)
 * - Removes whitespace and line breaks
 * - Preserves original residue order
 * - Validates sequence before display/usage
 */
export function parseAndValidateFasta(
  rawInput: string,
  expectedType?: 'PROTEIN' | 'DNA' | 'RNA' | 'AUTO'
): FastaValidationResult {
  if (!rawInput || typeof rawInput !== 'string') {
    return {
      header: '',
      sequence: '',
      isValid: false,
      type: 'UNKNOWN',
      length: 0,
      invalidCharacters: [],
      errorMessage: 'No sequence data provided'
    };
  }

  const lines = rawInput.split(/\r?\n/);
  let header = '';
  const seqLines: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (trimmed.startsWith('>')) {
      if (!header) {
        header = trimmed.substring(1).trim();
      }
    } else {
      seqLines.push(trimmed);
    }
  }

  const sequence = seqLines.join('').replace(/\s+/g, '').toUpperCase();
  if (!sequence) {
    return {
      header,
      sequence: '',
      isValid: false,
      type: 'UNKNOWN',
      length: 0,
      invalidCharacters: [],
      errorMessage: 'Empty biological sequence after removing headers and whitespace'
    };
  }

  // Detect type if auto
  let detectedType: 'PROTEIN' | 'DNA' | 'RNA' = 'PROTEIN';
  if (expectedType && expectedType !== 'AUTO') {
    detectedType = expectedType;
  } else {
    // Check authoritative FASTA header annotations for RefSeq mRNA / transcript variants
    const isMrnaOrRnaHeader = header && (
      /\b(NM_|XM_|NR_|XR_)\w+/i.test(header) ||
      /\b(mRNA|transcript)\b/i.test(header)
    );

    if (isMrnaOrRnaHeader) {
      detectedType = 'RNA';
    } else {
      // Check if DNA/RNA
      const hasU = sequence.includes('U');
      const hasT = sequence.includes('T');
      const dnaChars = sequence.replace(/[^ACGTN]/g, '').length;
      const rnaChars = sequence.replace(/[^ACGUN]/g, '').length;
      const total = sequence.length;

      if (hasU && !hasT && rnaChars / total > 0.85) {
        detectedType = 'RNA';
      } else if (hasT && !hasU && dnaChars / total > 0.85) {
        detectedType = 'DNA';
      } else {
        detectedType = 'PROTEIN';
      }
    }
  }

  // Validate according to type
  const invalidSet = new Set<string>();
  const allowedRegex =
    detectedType === 'PROTEIN'
      ? PROTEIN_ALLOWED_REGEX
      : detectedType === 'RNA'
      ? RNA_ALLOWED_REGEX
      : DNA_ALLOWED_REGEX;

  for (const char of sequence) {
    if (!allowedRegex.test(char)) {
      invalidSet.add(char);
    }
  }

  const invalidCharacters = Array.from(invalidSet);
  const isValid = invalidCharacters.length === 0;

  return {
    header,
    sequence,
    isValid,
    type: detectedType,
    length: sequence.length,
    invalidCharacters,
    errorMessage: isValid
      ? undefined
      : `Sequence contains invalid ${detectedType} character(s): ${invalidCharacters.join(', ')}`
  };
}

