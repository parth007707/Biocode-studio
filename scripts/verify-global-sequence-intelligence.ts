import { detectSequence } from '../src/lib/bio/sequenceDetector';
import { parseAndValidateFasta } from '../src/lib/bio/sequenceParser';
import { resolveStructureForSequence } from '../src/server/structureService';
import { normalizeAnalysisRecord } from '../src/lib/bio/editor/normalizeAnalysisRecord';
import { computeMutationsFromSequences } from '../src/lib/bio/editor/mutationEngine';

async function runGlobalIntelligenceVerification() {
  console.log('=====================================================================');
  console.log('🧬 BioCode Studio: Global Sequence Intelligence & Architecture Verification');
  console.log('=====================================================================\n');

  let passes = 0;
  let failures = 0;

  function assert(condition: boolean, testName: string, detail?: string) {
    if (condition) {
      console.log(`✅ [PASS] ${testName}`);
      if (detail) console.log(`   └─ ${detail}`);
      passes++;
    } else {
      console.error(`❌ [FAIL] ${testName}`);
      if (detail) console.error(`   └─ Error: ${detail}`);
      failures++;
    }
  }

  // 1. CATEGORY: Genomic DNA (NC_ record)
  console.log('\n--- Category 1: Genomic DNA (NC_000001.1) ---');
  const genomicDet = detectSequence('ATGCGATCGATCGATCGATC', { accession: 'NC_000001.1', source: 'NCBI' }, '>NC_000001.1 Chromosome 1 genomic DNA');
  assert(genomicDet.detectedType === 'DNA', 'Genomic DNA detected as DNA', `Got: ${genomicDet.detectedType}`);
  assert(genomicDet.biologicalClassification?.sequence_type === 'Genomic DNA', 'Classified as Genomic DNA', `Got: ${genomicDet.biologicalClassification?.sequence_type}`);

  // 2. CATEGORY: Plasmid / Coding DNA (CDS)
  console.log('\n--- Category 2: Plasmid / Coding DNA (CDS) ---');
  const plasmidDet = detectSequence('ATGGCCGATCGATCGATCGATAG', { accession: 'pUC19_CDS', source: 'GenBank', molecule_type: 'coding DNA', sequence_type: 'CDS' }, '>pUC19 beta-lactamase CDS');
  assert(plasmidDet.detectedType === 'DNA', 'Plasmid/CDS detected as DNA', `Got: ${plasmidDet.detectedType}`);

  // 3. CATEGORY: mRNA Transcript (NM_ record)
  console.log('\n--- Category 3: mRNA Transcript (NM_000518.4) ---');
  const mrnaDet = detectSequence('ACAUUUGCUUCUGACACA', { accession: 'NM_000518.4', source: 'NCBI', molecule_type: 'mRNA', sequence_type: 'mRNA Transcript' }, '>NM_000518.4 HBB mRNA');
  assert(mrnaDet.detectedType === 'RNA', 'mRNA transcript detected as RNA', `Got: ${mrnaDet.detectedType}`);
  assert(mrnaDet.biologicalClassification?.molecule_type === 'mRNA', 'Molecule type is mRNA', `Got: ${mrnaDet.biologicalClassification?.molecule_type}`);

  // 4. CATEGORY: Non-Coding RNA (rRNA, tRNA, ncRNA)
  console.log('\n--- Category 4: Non-Coding RNA (NR_003286.2 tRNA/rRNA) ---');
  const ncrnaDet = detectSequence('GCGGAUUUAGCUCAGUUGGGAGAGCGCCAGACUGAAGAUCUGGAGGUCCUGUGUUCGAUCCACAGAAUUCGCACCA', { accession: 'NR_003286.2', source: 'NCBI', molecule_type: 'tRNA', sequence_type: 'Non-Coding RNA' }, '>NR_003286.2 tRNA-Phe');
  assert(ncrnaDet.detectedType === 'RNA', 'tRNA detected as RNA', `Got: ${ncrnaDet.detectedType}`);
  assert(ncrnaDet.biologicalClassification?.molecule_type === 'tRNA' || ncrnaDet.biologicalClassification?.molecule_type === 'ncRNA', 'tRNA/ncRNA classification correct', `Got: ${ncrnaDet.biologicalClassification?.molecule_type}`);

  // 5. CATEGORY: Protein Sequence (NP_ record / UniProt)
  console.log('\n--- Category 5: Protein Sequence (NP_000509.1 / UniProt P68871) ---');
  const protDet = detectSequence('VHLTPEEKSAVTALWGKVNVDEVGGEALGRLLVVYPWTQRFFESFGDLSTPDAVMGNPK', { accession: 'P68871', source: 'UniProt' }, '>sp|P68871|HBB_HUMAN Hemoglobin subunit beta');
  assert(protDet.detectedType === 'PROTEIN', 'UniProt protein detected as PROTEIN', `Got: ${protDet.detectedType}`);

  // 6. CATEGORY: FASTA Upload & Custom Sequence
  console.log('\n--- Category 6: FASTA Upload & Custom Sequence ---');
  const fastaUpload = parseAndValidateFasta('>CUSTOM_TEST mRNA transcript\nAUGGGCUAGCUAGCUAGCUAG', 'AUTO');
  assert(fastaUpload.type === 'RNA', 'FASTA upload parsed and validated correctly', `Got: ${fastaUpload.type}`);

  // 7. STRUCTURE RESOLUTION PIPELINE (Experimental PDB, Predicted, Unavailable)
  console.log('\n--- Category 7: Global Structure Resolution Pipeline ---');
  const struct1BNA = await resolveStructureForSequence({
    sequence: 'CGCGAATTCGCG',
    sequenceType: 'DNA',
    accession: '1BNA',
    allowSequenceDerivedFallback: false
  });
  assert(struct1BNA.structureType === 'EXPERIMENTAL', '1BNA DNA structure resolved as EXPERIMENTAL', `Got: ${struct1BNA.structureType}`);

  const structFallback = await resolveStructureForSequence({
    sequence: 'NM_007294_MRNA_LONG_TRANSCRIPT_SEQUENCE_EXAMPLE',
    sequenceType: 'RNA',
    accession: 'NM_007294.4',
    allowSequenceDerivedFallback: true
  });
  assert(structFallback.structureType === 'PREDICTED', 'RNA transcript without PDB crystal successfully resolves to predicted 3D fold model', `Got: ${structFallback.structureType}`);

  // 8. MUTATION & COMPARATIVE ANALYSIS HANDLING
  console.log('\n--- Category 8: Mutation & Comparative Analysis ---');
  const mutations = computeMutationsFromSequences('VHLTPEE', 'VHLTVEE', 'PROTEIN');
  assert(mutations.length === 1 && mutations[0].position === 5, 'Mutation correctly detected at position 5 (P->V)', `Mutations detected: ${mutations.length}`);

  console.log('\n=====================================================================');
  console.log(`Results: ${passes} Passed, ${failures} Failed`);
  console.log('=====================================================================');
}

runGlobalIntelligenceVerification().catch(err => {
  console.error('Verification failed with error:', err);
  process.exit(1);
});
