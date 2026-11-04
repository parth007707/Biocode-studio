import { parsePDBText } from '../src/lib/bio/structure3d/pdbParser';
import { generateMutatedHomologyPdb, generateDnaStructure3D, generateRnaStructure3D } from '../src/lib/bio/structure3d/structureGenerator';
import { buildSequenceToStructureMapping, isResidueModeledInStructure } from '../src/lib/bio/structure3d/residueMapping';
import { computeClientSequenceHash } from '../src/lib/bio/structure3d/structureResolver';

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ TEST FAILED: ${message}`);
    process.exit(1);
  }
}

console.log('🧪 Running 3D Structure Explorer Audit & Stability Tests...\n');

// Sample PDB text for testing PDB parser & homology mutagenesis
const samplePdbText = `HEADER    OXIGEN BINDING PROTEIN                  17-JUL-84   1HCO              
TITLE     HUMAN BETA-GLOBIN                                                     
ATOM      1  N   VAL A   1      12.123  14.456  16.789  1.00 25.00           N  
ATOM      2  CA  VAL A   1      13.234  15.567  17.890  1.00 25.00           C  
ATOM      3  C   VAL A   1      14.345  16.678  18.901  1.00 25.00           C  
ATOM      4  O   VAL A   1      15.456  17.789  19.012  1.00 25.00           O  
ATOM      5  N   HIS A   2      16.567  18.890  20.123  1.00 28.00           N  
ATOM      6  CA  HIS A   2      17.678  19.901  21.234  1.00 28.00           C  
ATOM      7  C   HIS A   2      18.789  20.012  22.345  1.00 28.00           C  
ATOM      8  O   HIS A   2      19.890  21.123  23.456  1.00 28.00           O  
ATOM      9  N   LEU A   3      20.012  22.234  24.567  1.00 30.00           N  
ATOM     10  CA  LEU A   3      21.123  23.345  25.678  1.00 30.00           C  
END                                                                             `;

// -----------------------------------------------------------------------------
// Test 1: PDB Parser Verification
// -----------------------------------------------------------------------------
console.log('Test 1: Parsing 3D PDB Atomic Coordinates & Residues...');
const parsed = parsePDBText(samplePdbText, '1HCO');

assert(parsed.chains.length === 1, 'Expected 1 chain in parsed PDB');
assert(parsed.chains[0].id === 'A', 'Expected Chain A');
assert(parsed.chains[0].residues.length === 3, 'Expected 3 residues (VAL1, HIS2, LEU3)');
assert(parsed.allAtoms.length === 10, 'Expected 10 total atomic coordinates');
assert(parsed.allAtoms[0].x === 12.123, 'Atomic coordinate X mismatch');
console.log('  ✅ PDB Parser correctly extracted chains, residues, and atomic coordinates');

// -----------------------------------------------------------------------------
// Test 2: Sequence-to-Structure Mapping
// -----------------------------------------------------------------------------
console.log('\nTest 2: Sequence-to-Structure Position Mapping...');
const fullSeq = 'VHLTPEEKSAVTALWGKVNV'; // 20 aa
const mapping = buildSequenceToStructureMapping(fullSeq, parsed);

assert(mapping.length === 20, 'Mapping should cover all 20 sequence positions');
assert(isResidueModeledInStructure(mapping, 1) === true, 'Residue 1 (VAL) should be modeled');
assert(isResidueModeledInStructure(mapping, 2) === true, 'Residue 2 (HIS) should be modeled');
assert(isResidueModeledInStructure(mapping, 3) === true, 'Residue 3 (LEU) should be modeled');
assert(isResidueModeledInStructure(mapping, 4) === false, 'Residue 4 (THR) should be unmodeled');
console.log('  ✅ Residue 1-3 marked as modeled in 3D structure');
console.log('  ✅ Residue 4-20 marked as unmodeled (partial structure coverage)');

// -----------------------------------------------------------------------------
// Test 3: Homology Mutagenesis on Template Coordinates
// -----------------------------------------------------------------------------
console.log('\nTest 3: Homology Mutagenesis on Template PDB Coordinates...');
const mutations = [
  {
    id: 'mut_1',
    position: 2,
    operation: 'substitution' as const,
    original: 'H',
    modified: 'A',
    lengthChange: 0,
    timestamp: new Date().toISOString(),
    description: 'H2A substitution'
  }
];

const homology = generateMutatedHomologyPdb(samplePdbText, mutations, '1HCO');
assert(homology.modeledCount === 1, 'Expected 1 mutation modeled inside 3D template');
assert(homology.pdbText.includes('ALA A   2'), 'Mutated PDB text should contain ALA at position 2');
console.log('  ✅ Point mutation H2A successfully modeled on template coordinates');

// -----------------------------------------------------------------------------
// Test 4: DNA & RNA 3D Double Helix / Fold Schematic Generation
// -----------------------------------------------------------------------------
console.log('\nTest 4: DNA B-Form Helix & RNA A-Form Fold Geometry...');
const dnaStruct = generateDnaStructure3D('ATGCGTACGTTAGC', 'Test DNA');
assert(dnaStruct.chains.length === 2, 'DNA should generate 2 complementary strands (Chains A & B)');
assert(dnaStruct.allAtoms.length > 0, 'DNA model should contain atomic coordinates');

const rnaStruct = generateRnaStructure3D('AUGCGUACGUUAGC', undefined, 'Test RNA');
assert(rnaStruct.chains.length === 1, 'RNA should generate 1 single strand (Chain A)');
assert(rnaStruct.allAtoms.length > 0, 'RNA model should contain atomic coordinates');
console.log('  ✅ B-DNA double helix generated with', dnaStruct.allAtoms.length, 'atoms');
console.log('  ✅ A-RNA tertiary fold generated with', rnaStruct.allAtoms.length, 'atoms');

// -----------------------------------------------------------------------------
// Test 5: Client Sequence Hash Determinism
// -----------------------------------------------------------------------------
console.log('\nTest 5: Client Sequence Hash Consistency...');
const hash1 = computeClientSequenceHash('ATGCGTACGTTAGC');
const hash2 = computeClientSequenceHash('ATGCGTACGTTAGC');
const hash3 = computeClientSequenceHash('ATGCGTACGTTAGT');

assert(hash1 === hash2, 'Identical sequences must produce identical hashes');
assert(hash1 !== hash3, 'Different sequences must produce different hashes');
console.log('  ✅ Client sequence hashes verified as deterministic');

console.log('\n🎉 ALL 3D STRUCTURE EXPLORER AUDIT TESTS PASSED SUCCESSFULLY!');
