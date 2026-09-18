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
  rawSequenceLines: string[];
  hasInvalidChars: boolean;
  invalidChars: string[];
}

export function parseSequence(input: string): RawParsedData {
  if (!input || typeof input !== 'string') {
    return {
      rawInput: '',
      fastaHeader: null,
      cleanedSequence: '',
      rawSequenceLines: [],
      hasInvalidChars: false,
      invalidChars: []
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
  for (let i = 0; i < upperCaseRaw.length; i++) {
    const char = upperCaseRaw[i];
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
    rawSequenceLines,
    hasInvalidChars: invalidCharsFound.length > 0,
    invalidChars: invalidCharsFound
  };
}

export function parseFasta(input: string): { header: string | null; sequence: string } {
  const parsed = parseSequence(input);
  return {
    header: parsed.fastaHeader,
    sequence: parsed.cleanedSequence
  };
}

