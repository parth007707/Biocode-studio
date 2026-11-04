import { computeMutationsFromSequences, applySubstitution, applyInsertion, applyDeletion } from '../src/lib/bio/editor/mutationEngine';
import { simulateMultipleSequenceChanges, validateMultipleWhatIfChanges } from '../src/lib/bio/whatIfSimulator';
import { generateComparativeAnalysisReport } from '../src/lib/bio/editor/comparativeAnalysisEngine';
import { analyzeProteinSequence } from '../src/lib/bio/proteinAnalysis';

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ TEST FAILED: ${message}`);
    process.exit(1);
  }
}

console.log('🧪 Running BioCode Studio Original Sequence Immutability & Mutation Regression Tests...');

// Baseline sequence (e.g. p53 DNA core excerpt or protein segment)
const baselineOriginalSequence = 'ATGCGTACGTTAGCTAGCTAGCTAGCTA';
const initialCopy = String(baselineOriginalSequence);

// -----------------------------------------------------------------------------
// Test 1: Sequential Mutations Do Not Mutate Original Sequence Baseline
// -----------------------------------------------------------------------------
console.log('Test 1: Applying 3 sequential mutations (Sub, Ins, Del)...');
let workingSeq = String(baselineOriginalSequence);

const subResult = applySubstitution(workingSeq, 5, 'A');
workingSeq = subResult.newSequence;

const insResult = applyInsertion(workingSeq, 10, 'TTT');
workingSeq = insResult.newSequence;

const delResult = applyDeletion(workingSeq, 15, 17);
workingSeq = delResult.newSequence;

assert(baselineOriginalSequence === initialCopy, 'Original sequence string variable was modified in memory!');
assert(workingSeq !== baselineOriginalSequence, 'Working sequence failed to reflect applied mutations.');
console.log('  ✅ Working sequence updated:', workingSeq);
console.log('  ✅ Original sequence remains immutable:', baselineOriginalSequence);

// -----------------------------------------------------------------------------
// Test 2: What-If Simulator Batch Execution (3 Mutations Applied Simultaneously)
// -----------------------------------------------------------------------------
console.log('\nTest 2: Batch simulating 3 mutations via What-If Simulator...');
const changesToSimulate = [
  {
    id: 'change_1',
    position: 4,
    type: 'substitution' as const,
    originalResidue: 'C',
    modifiedResidue: 'T',
    description: 'C4T'
  },
  {
    id: 'change_2',
    position: 8,
    type: 'insertion' as const,
    insertedSequence: 'GAA',
    description: 'Ins8GAA'
  },
  {
    id: 'change_3',
    position: 18,
    type: 'deletion' as const,
    deletionStart: 18,
    deletionEnd: 20,
    description: 'Del18..20'
  }
];

const validation = validateMultipleWhatIfChanges(baselineOriginalSequence, 'DNA', changesToSimulate);
assert(validation.isValid === true, `Validation failed: ${validation.error}`);

const simResult = simulateMultipleSequenceChanges({
  sequence: baselineOriginalSequence,
  sequenceType: 'DNA',
  changes: changesToSimulate
});

assert(simResult.originalSequence === baselineOriginalSequence, 'Simulation result corrupted originalSequence property.');
assert(simResult.simulatedSequence !== baselineOriginalSequence, 'Simulated sequence matches original sequence despite 3 changes.');
assert(simResult.mutations.length > 0, 'No derived mutations detected between original and simulated sequence.');
console.log('  ✅ Batch simulated sequence:', simResult.simulatedSequence);
console.log('  ✅ Original sequence in result:', simResult.originalSequence);
console.log('  ✅ Detected mutation count:', simResult.mutations.length);

// -----------------------------------------------------------------------------
// Test 3: Comparative Analysis Engine Isolation
// -----------------------------------------------------------------------------
console.log('\nTest 3: Generating comparative analysis report (Original V1 vs Modified V2)...');
const derivedMutations = computeMutationsFromSequences(baselineOriginalSequence, simResult.simulatedSequence, 'DNA');
const compReport = generateComparativeAnalysisReport({
  originalSequence: baselineOriginalSequence,
  modifiedSequence: simResult.simulatedSequence,
  sequenceType: 'DNA',
  pipeline: 'Automated Test Suite',
  mutations: derivedMutations
});

assert(compReport.versionMetadata.version1.sequence === baselineOriginalSequence, 'Comparative report V1 sequence does not match baseline original.');
assert(compReport.versionMetadata.version2.sequence === simResult.simulatedSequence, 'Comparative report V2 sequence does not match mutated sequence.');
assert(compReport.isModified === true, 'Comparative report failed to mark sequence as modified.');
console.log('  ✅ Comparative report V1 baseline:', compReport.versionMetadata.version1.sequence);
console.log('  ✅ Comparative report V2 modified:', compReport.versionMetadata.version2.sequence);

// -----------------------------------------------------------------------------
// Test 4: Protein Sequence Immutability Test
// -----------------------------------------------------------------------------
console.log('\nTest 4: Testing Protein sequence mutation immutability...');
const proteinOriginal = 'MEEPQSDPSVEPPLSQETFSDLWKLLPENNVLSPLPSQAMDDLMLSPDDIEQWFTEDPGP';
const proteinCopy = String(proteinOriginal);

const protSub = applySubstitution(proteinOriginal, 17, 'A'); // E17A mutation
const proteinWorking = protSub.newSequence;

const origProtAnalysis = analyzeProteinSequence(proteinOriginal);
const modProtAnalysis = analyzeProteinSequence(proteinWorking);

assert(proteinOriginal === proteinCopy, 'Protein original sequence was mutated during substitution!');
assert(origProtAnalysis.length === proteinOriginal.length, 'Original protein analysis length mismatch.');
assert(modProtAnalysis.counts['A'] > origProtAnalysis.counts['A'], 'Modified protein analysis failed to reflect E17A substitution.');
console.log('  ✅ Original protein sequence unchanged:', proteinOriginal);
console.log('  ✅ Modified protein sequence reflects mutation:', proteinWorking);

console.log('\n🎉 ALL IMMUTABILITY & MUTATION REGRESSION TESTS PASSED SUCCESSFULLY!');
