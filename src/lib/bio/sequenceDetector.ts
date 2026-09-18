import { SequenceType } from './types';
import { SequenceSourceMetadata } from '../../services/adapters/types';

export interface DetectionResult {
  detectedType: SequenceType;
  confidence: number; // 0.0 to 1.0
  reason: string;
  isAmbiguous: boolean;
  isMixedTU: boolean;
  biologicalClassification?: {
    molecule_type: string;
    sequence_type: string;
    strand: string;
    topology: string;
  };
}

export function detectSequence(
  seq: string,
  metadata?: SequenceSourceMetadata | null,
  fastaHeader?: string | null
): DetectionResult {
  if (!seq || seq.length === 0) {
    return {
      detectedType: 'UNKNOWN',
      confidence: 0,
      reason: 'Empty sequence',
      isAmbiguous: false,
      isMixedTU: false
    };
  }

  const upper = seq.toUpperCase();

  // Check for characters outside standard biological letters and *
  if (/[^A-Z*]/.test(upper)) {
    return {
      detectedType: 'UNKNOWN',
      confidence: 0,
      reason: 'Contains non-alphabetic or invalid biological characters',
      isAmbiguous: false,
      isMixedTU: false
    };
  }

  const hasT = upper.includes('T');
  const hasU = upper.includes('U');

  // Check for mixed T and U
  if (hasT && hasU) {
    return {
      detectedType: 'UNKNOWN',
      confidence: 0,
      reason: 'Biologically invalid: Sequence contains both Thymine (T) and Uracil (U)',
      isAmbiguous: false,
      isMixedTU: true
    };
  }

  // 1. Metadata-Driven Biological Classification
  if (metadata) {
    const accUpper = (metadata.accession || '').toUpperCase();
    const sourceDb = (metadata.database || '').toLowerCase();
    const moltype = (metadata.molecule_type || metadata.moleculeType || '').toLowerCase();
    const seqType = (metadata.sequence_type || metadata.sequenceType || '').toLowerCase();
    const title = (metadata.title || metadata.definition || '').toLowerCase();

    // Protein from metadata
    if (
      metadata.source === 'UniProt' ||
      metadata.source === 'RCSB_PDB' ||
      sourceDb === 'protein' ||
      moltype.includes('protein') ||
      moltype.includes('peptide') ||
      seqType === 'protein' ||
      accUpper.startsWith('NP_') ||
      accUpper.startsWith('XP_') ||
      accUpper.startsWith('YP_') ||
      accUpper.startsWith('WP_') ||
      accUpper.startsWith('AP_') ||
      accUpper.startsWith('GP_')
    ) {
      return {
        detectedType: 'PROTEIN',
        confidence: 1.0,
        reason: `Verified Protein record (${metadata.accession || metadata.source})`,
        isAmbiguous: false,
        isMixedTU: false,
        biologicalClassification: {
          molecule_type: 'protein',
          sequence_type: 'Protein',
          strand: 'single polypeptide chain',
          topology: 'linear'
        }
      };
    }

    // RefSeq mRNA Transcripts (NM_, XM_)
    if (
      accUpper.startsWith('NM_') ||
      accUpper.startsWith('XM_') ||
      moltype === 'mrna' ||
      seqType.includes('mrna') ||
      title.includes('mrna') ||
      title.includes('transcript variant')
    ) {
      return {
        detectedType: 'RNA',
        confidence: 1.0,
        reason: `RefSeq mRNA Transcript (${metadata.accession}) - Single-Stranded Coding RNA`,
        isAmbiguous: false,
        isMixedTU: false,
        biologicalClassification: {
          molecule_type: 'mRNA',
          sequence_type: 'mRNA Transcript',
          strand: 'single-stranded',
          topology: 'linear'
        }
      };
    }

    // RefSeq Non-Coding RNA (NR_, XR_, ncRNA, lncRNA, miRNA, tRNA, rRNA, snRNA)
    if (
      accUpper.startsWith('NR_') ||
      accUpper.startsWith('XR_') ||
      moltype === 'ncrna' ||
      moltype.includes('rrna') ||
      moltype.includes('trna') ||
      moltype.includes('snrna') ||
      moltype.includes('lncrna') ||
      seqType.includes('non-coding') ||
      title.includes('non-coding rna') ||
      title.includes('ncrna') ||
      title.includes('lncrna')
    ) {
      return {
        detectedType: 'RNA',
        confidence: 1.0,
        reason: `RefSeq Non-Coding RNA (${metadata.accession}) - Single-Stranded ncRNA`,
        isAmbiguous: false,
        isMixedTU: false,
        biologicalClassification: {
          molecule_type: 'ncRNA',
          sequence_type: 'Non-Coding RNA',
          strand: 'single-stranded',
          topology: 'linear'
        }
      };
    }

    // NC_ records (Genomic molecule)
    if (accUpper.startsWith('NC_')) {
      if (
        moltype.includes('genomic rna') ||
        moltype.includes('viral rna') ||
        title.includes('coronavirus') ||
        title.includes('sars-cov-2') ||
        title.includes('influenza') ||
        title.includes('hiv') ||
        title.includes('rna virus')
      ) {
        return {
          detectedType: 'RNA',
          confidence: 1.0,
          reason: `RefSeq Viral Genomic RNA (${metadata.accession})`,
          isAmbiguous: false,
          isMixedTU: false,
          biologicalClassification: {
            molecule_type: 'genomic RNA',
            sequence_type: 'Genomic RNA (Viral)',
            strand: 'single-stranded',
            topology: 'linear'
          }
        };
      }

      return {
        detectedType: 'DNA',
        confidence: 1.0,
        reason: `RefSeq Genomic DNA Record (${metadata.accession})`,
        isAmbiguous: false,
        isMixedTU: false,
        biologicalClassification: {
          molecule_type: 'genomic DNA',
          sequence_type: 'Genomic DNA',
          strand: 'double-stranded',
          topology: title.includes('circular') || title.includes('plasmid') ? 'circular' : 'linear'
        }
      };
    }

    // General explicit DNA or RNA molecule type
    if (moltype.includes('rna') || seqType.includes('rna')) {
      return {
        detectedType: 'RNA',
        confidence: 1.0,
        reason: `Biological Database RNA Record (${metadata.accession || metadata.source})`,
        isAmbiguous: false,
        isMixedTU: false,
        biologicalClassification: {
          molecule_type: metadata.molecule_type || 'RNA',
          sequence_type: metadata.sequence_type || 'RNA Transcript',
          strand: metadata.strand || 'single-stranded',
          topology: metadata.topology || 'linear'
        }
      };
    }

    if (moltype.includes('dna') || seqType.includes('dna')) {
      return {
        detectedType: 'DNA',
        confidence: 1.0,
        reason: `Biological Database DNA Record (${metadata.accession || metadata.source})`,
        isAmbiguous: false,
        isMixedTU: false,
        biologicalClassification: {
          molecule_type: metadata.molecule_type || 'genomic DNA',
          sequence_type: metadata.sequence_type || 'Genomic DNA',
          strand: metadata.strand || 'double-stranded',
          topology: metadata.topology || 'linear'
        }
      };
    }
  }

  // 2. FASTA Header Inference (when metadata is not directly provided)
  if (fastaHeader) {
    const headerLower = fastaHeader.toLowerCase();
    const headerUpper = fastaHeader.toUpperCase();

    if (
      /\b(NP_|XP_|YP_|WP_|AP_|GP_)\w+/i.test(headerUpper) ||
      headerLower.includes('protein') ||
      headerLower.includes('peptide') ||
      headerLower.includes('polypeptide')
    ) {
      return {
        detectedType: 'PROTEIN',
        confidence: 0.95,
        reason: 'FASTA header annotation identifies sequence as Protein/Polypeptide',
        isAmbiguous: false,
        isMixedTU: false
      };
    }

    if (
      /\b(NM_|XM_)\w+/i.test(headerUpper) ||
      headerLower.includes('mrna') ||
      (headerLower.includes('transcript') && !headerLower.includes('dna'))
    ) {
      return {
        detectedType: 'RNA',
        confidence: 0.95,
        reason: 'FASTA header annotation identifies sequence as mRNA Transcript',
        isAmbiguous: false,
        isMixedTU: false
      };
    }

    if (
      /\b(NR_|XR_)\w+/i.test(headerUpper) ||
      headerLower.includes('non-coding rna') ||
      headerLower.includes('ncrna') ||
      headerLower.includes('lncrna')
    ) {
      return {
        detectedType: 'RNA',
        confidence: 0.95,
        reason: 'FASTA header annotation identifies sequence as Non-Coding RNA (ncRNA)',
        isAmbiguous: false,
        isMixedTU: false
      };
    }
  }

  // 3. Intrinsic Sequence Content-Based Detection
  // Protein-specific residue characters that NEVER appear in DNA/RNA:
  // IUPAC DNA/RNA uses: A, C, G, T, U, R, Y, S, W, K, M, B, D, H, V, N.
  // Protein letters not in IUPAC DNA/RNA: E, F, I, L, P, Q, Z, J, O.
  const hasProteinExclusiveResidues = /[EFILPQZJO]/i.test(upper);

  if (hasProteinExclusiveResidues) {
    const validProteinRegex = /^[ACDEFGHIKLMNPQRSTVWY*]+$/i;
    if (validProteinRegex.test(upper)) {
      return {
        detectedType: 'PROTEIN',
        confidence: 1.0,
        reason: 'Unambiguous amino acid sequence with characteristic protein residues',
        isAmbiguous: false,
        isMixedTU: false
      };
    }
  }

  // If U exists and no T -> Unambiguously RNA
  if (hasU && !hasT) {
    if (/^[ACGU]+$/i.test(upper)) {
      return {
        detectedType: 'RNA',
        confidence: 1.0,
        reason: 'Canonical RNA sequence containing Uracil (A, C, G, U)',
        isAmbiguous: false,
        isMixedTU: false
      };
    }
    if (/^[ACGUNRYWSKMBDHV]+$/i.test(upper)) {
      return {
        detectedType: 'RNA',
        confidence: 0.90,
        reason: 'IUPAC degenerate RNA sequence',
        isAmbiguous: false,
        isMixedTU: false
      };
    }
  }

  // If T exists and no U
  if (hasT && !hasU) {
    if (/^[ACGT]+$/i.test(upper)) {
      return {
        detectedType: 'DNA',
        confidence: 1.0,
        reason: 'Canonical DNA sequence (A, C, G, T)',
        isAmbiguous: false,
        isMixedTU: false
      };
    }
    if (/^[ACGTNRYWSKMBDHV]+$/i.test(upper)) {
      return {
        detectedType: 'DNA',
        confidence: 0.90,
        reason: 'IUPAC degenerate DNA sequence',
        isAmbiguous: false,
        isMixedTU: false
      };
    }
  }

  // Overlapping / ambiguous characters case:
  // If sequence only contains A, C, G (without T, U, or protein-exclusive residues)
  if (/^[ACG]+$/i.test(upper)) {
    return {
      detectedType: 'UNKNOWN',
      confidence: 0.35,
      reason: 'Ambiguous sequence: Contains only overlapping bases (A, C, G) without distinguishing Thymine (T), Uracil (U), or amino acid residues',
      isAmbiguous: true,
      isMixedTU: false
    };
  }

  // General protein fallback for sequences that do not contain T or U but have other standard amino acids
  const allValidAminoAcids = /^[ACDEFGHIKLMNPQRSTVWY*]+$/i.test(upper);
  if (allValidAminoAcids) {
    return {
      detectedType: 'PROTEIN',
      confidence: 0.85,
      reason: 'Amino acid sequence composition detected',
      isAmbiguous: false,
      isMixedTU: false
    };
  }

  return {
    detectedType: 'UNKNOWN',
    confidence: 0,
    reason: 'Could not classify sequence into a known biological type',
    isAmbiguous: false,
    isMixedTU: false
  };
}
