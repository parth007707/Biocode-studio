/**
 * Automated Verification Script: What-If Sequence Simulation Engine
 * 
 * Verifies all 8 functional requirements:
 * 1. Valid substitution simulation on protein (e.g. R175K on p53)
 * 2. Valid insertion simulation on DNA
 * 3. Valid deletion simulation on RNA
 * 4. Input validation rejects out-of-bounds position
 * 5. Input validation rejects mismatched current residue
 * 6. Input validation rejects invalid residue alphabet
 * 7. Simulation recalculates correct metrics without modifying original V1
 * 8. Apply simulation updates working copy while preserving original baseline
 */

import {
  simulateSequenceChange,
  validateWhatIfInput
} from '../src/lib/bio/whatIfSimulator';
import { analyzeProteinSequence } from '../src/lib/bio/proteinAnalysis';
import { analyzeGCAndORF } from '../src/lib/bio/orfAnalysis';
import { computeMutationsFromSequences } from '../src/lib/bio/editor/mutationEngine';

// Canonical human TP53 protein sequence (393 aa, Arg at position 175)
const TP53_CANONICAL_SEQUENCE = 
  'MEEPQSDPSVEPPLSQETFSDLWKLLPENNVLSPLPSQAMDDLMLSPDDIEQWFTEDPGP' +
  'DEAPRMPEAAPPVAPAPAAPTPAAPAPAPSWPLSSSVPSQKTYQGSYGFRLGFLHSGTAK' +
  'SVTCTYSPALNKMFCQLAKTCPVQLWVDSTPPPGTRVRAMAIYKQSQHMTEVVRRCPHHE' +
  'RCSDSDGLAPPQHLIRVEGNLRVEYLDDRNTFRHSVVVPYEPPEVGSDCTTIHYNYMCNS' +
  'SCMGGMNRRPILTIITLEDSSGNLLGRNSFEVRVCACPGRDRRTEEENLRKKGEPHHELP' +
  'PGSTKRALPNNTSSSPQPKKKPLDGEYFTLQIRGRERFEMFRELNEALELKDAQAGKEPG' +
  'GSRAHSSHLKSKKGQSTSRHKKLMFKTEGPDSD';

// Standard DNA test sequence (120 bp)
const TEST_DNA_SEQUENCE = 
  'ATGGCCATGGTGTCCAAAGGCGAAGAGCTGTTCACTGGTGTGGTGCCGATCCTGGTGGAG' +
  'CTGGACGGCGACGTGAACGGCCACAAGTTCAGCGTGTCCGGCGAGGGCGAGGGCGATGCC';

// Standard RNA test sequence (90 nt)
const TEST_RNA_SEQUENCE = 
  'AUGGCCAGUAGUGAUGACGUCAUCAAGGAGUUCAUGCGCUUCAAGGUGCACAUGGAG' +
  'GGCUCCGUGAACGGCCACGAGUUCGAGAUCGAGGG';

let totalTests = 0;
let passedTests = 0;

function assert(condition: boolean, testName: string, details?: string) {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`  ✓ [PASS] Test ${totalTests}: ${testName}`);
    if (details) console.log(`     ↳ ${details}`);
  } else {
    console.error(`  ✗ [FAIL] Test ${totalTests}: ${testName}`);
    if (details) console.error(`     ↳ Details: ${details}`);
  }
}

console.log('======================================================================');
console.log('   RUNNING AUTOMATED VERIFICATION: WHAT-IF SIMULATOR ENGINE           ');
console.log('======================================================================\n');

// -----------------------------------------------------------------------------
// TEST 1: Valid substitution simulation on protein (R175K on p53)
// -----------------------------------------------------------------------------
try {
  const p53Len = TP53_CANONICAL_SEQUENCE.length; // 393
  const origRes = TP53_CANONICAL_SEQUENCE[174]; // Pos 175 (0-indexed 174) should be 'R'
  
  const sim = simulateSequenceChange({
    sequence: TP53_CANONICAL_SEQUENCE,
    sequenceType: 'PROTEIN',
    mode: 'substitution',
    position: 175,
    candidateResidue: 'K'
  });

  const isR175 = origRes === 'R';
  const newResAt175 = sim.simulatedSequence[174];
  const simIsK = newResAt175 === 'K';
  const lenConserved = sim.simulatedSequence.length === 393;
  const metricsPresent = Boolean(sim.metrics.protein && sim.metrics.protein.deltas);
  const mwChanged = sim.metrics.protein?.deltas.mwKDaDelta !== undefined;
  const piChanged = sim.metrics.protein?.deltas.piDelta !== undefined;

  assert(
    isR175 && simIsK && lenConserved && metricsPresent && mwChanged && piChanged,
    'Valid substitution simulation on protein (R175K on p53)',
    `Pos 175: ${origRes} → ${newResAt175}, Len: ${sim.simulatedSequence.length} aa, ΔMW: ${sim.metrics.protein?.deltas.mwKDaDelta} kDa, ΔpI: ${sim.metrics.protein?.deltas.piDelta}`
  );
} catch (e: any) {
  assert(false, 'Valid substitution simulation on protein (R175K on p53)', e?.message);
}

// -----------------------------------------------------------------------------
// TEST 2: Valid insertion simulation on DNA
// -----------------------------------------------------------------------------
try {
  const origLen = TEST_DNA_SEQUENCE.length;
  const insertion = 'AATT';
  const insertPos = 10;

  const sim = simulateSequenceChange({
    sequence: TEST_DNA_SEQUENCE,
    sequenceType: 'DNA',
    mode: 'insertion',
    position: insertPos,
    insertionPos: insertPos,
    insertionResidues: insertion
  });

  const expectedLen = origLen + insertion.length;
  const isLenCorrect = sim.simulatedSequence.length === expectedLen;
  const insertedSegment = sim.simulatedSequence.slice(insertPos - 1, insertPos - 1 + insertion.length);
  const isInsertedCorrect = insertedSegment === insertion;
  const gcCalculated = typeof sim.metrics.nucleotide?.simulated.composition.gcPercentage === 'number';

  assert(
    isLenCorrect && isInsertedCorrect && gcCalculated,
    'Valid insertion simulation on DNA',
    `Original len: ${origLen} bp → Simulated len: ${sim.simulatedSequence.length} bp (+${insertion.length} bp '${insertion}'), GC: ${sim.metrics.nucleotide?.simulated.composition.gcPercentage}%`
  );
} catch (e: any) {
  assert(false, 'Valid insertion simulation on DNA', e?.message);
}

// -----------------------------------------------------------------------------
// TEST 3: Valid deletion simulation on RNA
// -----------------------------------------------------------------------------
try {
  const origLen = TEST_RNA_SEQUENCE.length;
  const delStart = 5;
  const delEnd = 8; // Deletes 4 nucleotides: positions 5, 6, 7, 8
  const deletedCount = delEnd - delStart + 1;

  const sim = simulateSequenceChange({
    sequence: TEST_RNA_SEQUENCE,
    sequenceType: 'RNA',
    mode: 'deletion',
    position: delStart,
    deletionStart: delStart,
    deletionEnd: delEnd
  });

  const expectedLen = origLen - deletedCount;
  const isLenCorrect = sim.simulatedSequence.length === expectedLen;
  const isRna = sim.metrics.sequenceType === 'RNA';
  const auCalculated = typeof sim.metrics.nucleotide?.simulated.composition.atPercentage === 'number';

  assert(
    isLenCorrect && isRna && auCalculated,
    'Valid deletion simulation on RNA',
    `Original len: ${origLen} nt → Simulated len: ${sim.simulatedSequence.length} nt (-${deletedCount} nt), AU%: ${sim.metrics.nucleotide?.simulated.composition.atPercentage}%`
  );
} catch (e: any) {
  assert(false, 'Valid deletion simulation on RNA', e?.message);
}

// -----------------------------------------------------------------------------
// TEST 4: Input validation rejects out-of-bounds position
// -----------------------------------------------------------------------------
try {
  const valOutOfBoundsLow = validateWhatIfInput({
    sequence: TEST_DNA_SEQUENCE,
    sequenceType: 'DNA',
    mode: 'substitution',
    position: 0,
    candidateResidue: 'C'
  });

  const valOutOfBoundsHigh = validateWhatIfInput({
    sequence: TEST_DNA_SEQUENCE,
    sequenceType: 'DNA',
    mode: 'substitution',
    position: 9999,
    candidateResidue: 'C'
  });

  const bothRejected = !valOutOfBoundsLow.isValid && !valOutOfBoundsHigh.isValid;
  const errorHasInfo = Boolean(valOutOfBoundsHigh.error && valOutOfBoundsHigh.error.includes('outside sequence bounds'));

  assert(
    bothRejected && errorHasInfo,
    'Input validation rejects out-of-bounds position',
    `Low bound error: "${valOutOfBoundsLow.error}", High bound error: "${valOutOfBoundsHigh.error}"`
  );
} catch (e: any) {
  assert(false, 'Input validation rejects out-of-bounds position', e?.message);
}

// -----------------------------------------------------------------------------
// TEST 5: Input validation rejects mismatched current residue
// -----------------------------------------------------------------------------
try {
  // In p53, residue 175 is 'R'. Let's claim it is 'A'.
  const valMismatch = validateWhatIfInput({
    sequence: TP53_CANONICAL_SEQUENCE,
    sequenceType: 'PROTEIN',
    mode: 'substitution',
    position: 175,
    currentResidue: 'A', // Deliberate mismatch
    candidateResidue: 'K'
  });

  const isRejected = !valMismatch.isValid;
  const messageAccurate = Boolean(valMismatch.error && valMismatch.error.includes('contains R, but the selected current residue is A'));

  assert(
    isRejected && messageAccurate,
    'Input validation rejects mismatched current residue',
    `Error produced: "${valMismatch.error}"`
  );
} catch (e: any) {
  assert(false, 'Input validation rejects mismatched current residue', e?.message);
}

// -----------------------------------------------------------------------------
// TEST 6: Input validation rejects invalid residue alphabet
// -----------------------------------------------------------------------------
try {
  // Test DNA with non-DNA character 'K'
  const valDnaInvalid = validateWhatIfInput({
    sequence: TEST_DNA_SEQUENCE,
    sequenceType: 'DNA',
    mode: 'substitution',
    position: 1,
    candidateResidue: 'K'
  });

  // Test RNA with Thymine 'T'
  const valRnaInvalid = validateWhatIfInput({
    sequence: TEST_RNA_SEQUENCE,
    sequenceType: 'RNA',
    mode: 'substitution',
    position: 1,
    candidateResidue: 'T'
  });

  // Test Protein with number '7' or non-amino acid
  const valProtInvalid = validateWhatIfInput({
    sequence: TP53_CANONICAL_SEQUENCE,
    sequenceType: 'PROTEIN',
    mode: 'substitution',
    position: 1,
    candidateResidue: 'B' // Non-standard in 20 standard AA set
  });

  const allRejected = !valDnaInvalid.isValid && !valRnaInvalid.isValid && !valProtInvalid.isValid;

  assert(
    allRejected,
    'Input validation rejects invalid residue alphabet',
    `DNA reject: "${valDnaInvalid.error}", RNA reject: "${valRnaInvalid.error}", Protein reject: "${valProtInvalid.error}"`
  );
} catch (e: any) {
  assert(false, 'Input validation rejects invalid residue alphabet', e?.message);
}

// -----------------------------------------------------------------------------
// TEST 7: Simulation recalculates correct metrics without modifying original V1
// -----------------------------------------------------------------------------
try {
  const immutableV1 = TP53_CANONICAL_SEQUENCE;
  const initialV1Snapshot = immutableV1.slice();

  const simResult = simulateSequenceChange({
    sequence: immutableV1,
    sequenceType: 'PROTEIN',
    mode: 'substitution',
    position: 175,
    candidateResidue: 'H' // R175H oncogenic hotspot
  });

  // 1. Verify input string variable was not mutated
  const v1Preserved = immutableV1 === initialV1Snapshot && immutableV1[174] === 'R';

  // 2. Verify independent recalculation
  const baselineRecalc = analyzeProteinSequence(immutableV1);
  const simulatedRecalc = analyzeProteinSequence(simResult.simulatedSequence);

  const baselineMwMatches = simResult.metrics.protein?.original.molecularWeightKDa === baselineRecalc.molecularWeightKDa;
  const simulatedMwMatches = simResult.metrics.protein?.simulated.molecularWeightKDa === simulatedRecalc.molecularWeightKDa;
  const differenceRecorded = simResult.metrics.protein?.deltas.mwKDaDelta !== 0;

  assert(
    v1Preserved && baselineMwMatches && simulatedMwMatches && differenceRecorded,
    'Simulation recalculates correct metrics without modifying original V1',
    `V1 intact: ${v1Preserved}, Original MW: ${simResult.metrics.protein?.original.molecularWeightKDa} kDa, Simulated MW: ${simResult.metrics.protein?.simulated.molecularWeightKDa} kDa (Δ: ${simResult.metrics.protein?.deltas.mwKDaDelta} kDa)`
  );
} catch (e: any) {
  assert(false, 'Simulation recalculates correct metrics without modifying original V1', e?.message);
}

// -----------------------------------------------------------------------------
// TEST 8: Apply simulation updates working copy while preserving original baseline
// -----------------------------------------------------------------------------
try {
  // Simulate workflow:
  // Baseline master V1:
  const baselineV1 = TEST_DNA_SEQUENCE;
  let activeWorkingCopy = baselineV1;
  let isWorkingCopyModified = false;

  // Step 1: Run Simulation (Non-destructive)
  const sim = simulateSequenceChange({
    sequence: activeWorkingCopy,
    sequenceType: 'DNA',
    mode: 'substitution',
    position: 5,
    candidateResidue: 'T'
  });

  // Verify before Apply: Working copy is still unchanged
  const beforeApplyIntact = activeWorkingCopy === baselineV1 && !isWorkingCopyModified;

  // Step 2: User clicks "Apply to Working Copy"
  activeWorkingCopy = sim.simulatedSequence;
  isWorkingCopyModified = activeWorkingCopy !== baselineV1;

  // Step 3: Compute changes comparison against baseline V1
  const mutationsAgainstV1 = computeMutationsFromSequences(baselineV1, activeWorkingCopy, 'DNA');

  const afterApplyUpdated = activeWorkingCopy !== baselineV1;
  const v1BaselineProtected = baselineV1 === TEST_DNA_SEQUENCE && baselineV1[4] === 'C';
  const mutationAccuratelyDetected = mutationsAgainstV1.length === 1 && 
    mutationsAgainstV1[0].position === 5 && 
    mutationsAgainstV1[0].modified === 'T';

  assert(
    beforeApplyIntact && afterApplyUpdated && v1BaselineProtected && mutationAccuratelyDetected,
    'Apply simulation updates working copy while preserving original baseline',
    `Before apply modified: ${!beforeApplyIntact}, After apply modified: ${afterApplyUpdated}, V1 protected: ${v1BaselineProtected}, Mutation: ${mutationsAgainstV1[0]?.description}`
  );
} catch (e: any) {
  assert(false, 'Apply simulation updates working copy while preserving original baseline', e?.message);
}

// -----------------------------------------------------------------------------
// SUMMARY
// -----------------------------------------------------------------------------
console.log('\n======================================================================');
console.log(`   VERIFICATION RESULTS: ${passedTests}/${totalTests} TESTS PASSED`);
console.log('======================================================================\n');

if (passedTests === totalTests) {
  console.log('🎉 ALL 8 WHAT-IF SIMULATION TESTS COMPLETED SUCCESSFULLY!\n');
  process.exit(0);
} else {
  console.error(`❌ ${totalTests - passedTests} TESTS FAILED.`);
  process.exit(1);
}
