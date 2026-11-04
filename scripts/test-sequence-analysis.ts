import { parseAndValidateFasta, parseBiologicalInput } from '../src/lib/bio/sequenceParser';
import { validateBiologicalSequence } from '../src/lib/bio/sequenceValidator';
import { computeNucleotideComposition } from '../src/lib/bio/gcAnalysis';
import { analyzeProteinSequence } from '../src/lib/bio/proteinAnalysis';
import { extractFastaInfo, inferSourceFromAccession } from '../src/services/bio/sequenceLoader';

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ TEST FAILED: ${message}`);
    process.exit(1);
  }
}

console.log('🧪 Running BioCode Studio Sequence Retrieval & Scientific Analysis Tests...\n');

// -----------------------------------------------------------------------------
// Test 1: Infer Repository Source & Version Preservation
// -----------------------------------------------------------------------------
console.log('Test 1: Accession Inference & Version Retention...');
assert(inferSourceFromAccession('NM_000518.5') === 'NCBI', 'NM_000518.5 should infer NCBI');
assert(inferSourceFromAccession('NP_000537.3') === 'NCBI', 'NP_000537.3 should infer NCBI');
assert(inferSourceFromAccession('P68871') === 'UNIPROT', 'P68871 should infer UniProt');
assert(inferSourceFromAccession('1TUP') === 'RCSB_PDB', '1TUP should infer RCSB_PDB');
console.log('  ✅ Accession repository inference verified');

// -----------------------------------------------------------------------------
// Test 2: FASTA Header & Organism Parsing
// -----------------------------------------------------------------------------
console.log('\nTest 2: FASTA Header Extraction & Version Preserved Accession...');
const rawFastaSample = `>sp|P68871.2|HBB_HUMAN Hemoglobin subunit beta OS=Homo sapiens OX=9606 GN=HBB PE=1 SV=2
MVHLTPEEKSAVTALWGKVNVDEVGGEALGRLLVVYPWTQRFFESFGDLSTPDAVMGNPKVKAHGKKVLGAFSDGLAHLDNLKGTFATLSELHCDKLHVDPENFRLLGNVLVCVLAHHFGKEFTPPVQAAYQKVVAGVANALAHKYH`;

const fastaInfo = extractFastaInfo(rawFastaSample);
assert(fastaInfo.accession === 'P68871.2', 'Extracted accession mismatch (should retain version suffix P68871.2)');
assert(fastaInfo.organism === 'Homo sapiens', 'Extracted organism mismatch');
assert(fastaInfo.sequence.length === 147, 'Extracted sequence length mismatch');
console.log('  ✅ Extracted accession:', fastaInfo.accession);
console.log('  ✅ Extracted organism:', fastaInfo.organism);
console.log('  ✅ Extracted sequence length:', fastaInfo.sequence.length);

// -----------------------------------------------------------------------------
// Test 3: Ambiguous Nucleotide IUPAC Degeneracy Analysis
// -----------------------------------------------------------------------------
console.log('\nTest 3: IUPAC Ambiguous Nucleotides (S, W, R, Y, N) Analysis...');
const dnaWithAmbiguous = 'ATGCATNNSWRY';
const dnaComp = computeNucleotideComposition(dnaWithAmbiguous, 'DNA');

assert(dnaComp.length === dnaWithAmbiguous.length, 'DNA composition length does not match input length!');
assert(dnaComp.gcPercentage > 0, 'GC percentage calculation failed for ambiguous sequence.');
assert(dnaComp.counts['N'] === 2, 'Counts for N base mismatch.');
console.log('  ✅ Ambiguous DNA total length:', dnaComp.length);
console.log('  ✅ Calculated GC percentage:', dnaComp.gcPercentage + '%');
console.log('  ✅ Ambiguous N count:', dnaComp.counts['N']);

// -----------------------------------------------------------------------------
// Test 4: Ambiguous Protein Residues (X, B, Z) & Full Length Integrity
// -----------------------------------------------------------------------------
console.log('\nTest 4: Ambiguous Protein Residues (X, B, Z, *) & Complete Sequence Length...');
const protWithAmbiguous = 'MEEPQSDPSVEPPLSQX';
const protAnalysis = analyzeProteinSequence(protWithAmbiguous);

assert(protAnalysis.length === protWithAmbiguous.length, `Protein analysis length (${protAnalysis.length}) does not match input length (${protWithAmbiguous.length})!`);
assert(protAnalysis.molecularWeightKDa > 0, 'Protein molecular weight calculation failed.');
assert(protAnalysis.counts['X'] === 1, 'Protein X count mismatch.');
console.log('  ✅ Complete protein length preserved:', protAnalysis.length, 'aa');
console.log('  ✅ Calculated Molecular Weight:', protAnalysis.molecularWeightKDa, 'kDa');
console.log('  ✅ Ambiguous X residue counted:', protAnalysis.counts['X']);

// -----------------------------------------------------------------------------
// Test 5: Validation Engine & Invalid Input Handling
// -----------------------------------------------------------------------------
console.log('\nTest 5: Validation Engine Error Details on Invalid Input...');
const invalidInput = 'ATGCGT123$$$';
const valDetails = validateBiologicalSequence(invalidInput, 'DNA');

assert(valDetails.isValid === false, 'Validation failed to flag invalid numeric/symbol input.');
assert(valDetails.totalInvalidCount === 6, 'Invalid character count mismatch.');
assert(valDetails.hasNumbers === true, 'Failed to detect numeric digits.');
assert(valDetails.hasSymbols === true, 'Failed to detect symbols.');
console.log('  ✅ Validation correctly rejected invalid input');
console.log('  ✅ Total invalid characters flagged:', valDetails.totalInvalidCount);

console.log('\n🎉 ALL SEQUENCE RETRIEVAL & SCIENTIFIC ANALYSIS TESTS PASSED!');
