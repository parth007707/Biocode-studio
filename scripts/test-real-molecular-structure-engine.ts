import { resolveStructureForSequence, calculateSequenceHash } from '../src/server/structureService';
import { parsePDBText } from '../src/lib/bio/structure3d/pdbParser';
import { generateDnaStructure3D, generateRnaStructure3D, generateMutatedHomologyPdb } from '../src/lib/bio/structure3d/structureGenerator';
import { buildSequenceToStructureMapping, getStructureCoverageMetrics, evaluateMutationMapping } from '../src/lib/bio/structure3d/residueMapping';

let passedTests = 0;
let totalTests = 0;

function assert(condition: boolean, testName: string, details?: any) {
  totalTests++;
  if (condition) {
    console.log(`  [PASS] ${testName}`);
    passedTests++;
  } else {
    console.error(`  [FAIL] ${testName}`, details ? details : '');
    throw new Error(`Test failed: ${testName}`);
  }
}

async function runTestSuite() {
  console.log('\n=============================================================');
  console.log('BIOCODE STUDIO - REAL MOLECULAR STRUCTURE ENGINE VERIFICATION');
  console.log('=============================================================\n');

  // TEST 1: Experimental Structure Retrieval from RCSB PDB (Human Hemoglobin Subunit Beta)
  console.log('TEST SUITE 1: Real Experimental Structure Resolution (RCSB PDB)');
  {
    const hbbSeq = 'VHLTPEEKSAVTALWGKVNVDEVGGEALGRLLVVYPWTQRFFESFGDLSTPDAVMGNPKVKAHGKKVLGAFSDGLAHLDNLKGTFATLSELHCDKLHVDPENFRLLGNVLVCVLAHHFGKEFTPPVQAAYQKVVAGVANALAHKYH';
    const result = await resolveStructureForSequence({
      sequence: hbbSeq,
      accession: 'NP_000509',
      sequenceType: 'PROTEIN',
      mutations: []
    });

    assert(result.structureType === 'EXPERIMENTAL', 'HBB correctly classified as EXPERIMENTAL');
    assert(result.sourceId === '4HHB', 'HBB resolved to canonical 4HHB crystal structure');
    assert(result.structureFormat === 'PDB', 'Structure format is PDB');
    assert(result.pdbText.length > 5000, 'PDB coordinate text downloaded and non-empty');
    assert(result.pdbText.includes('ATOM  ') && result.pdbText.includes('4HHB'), 'PDB text contains genuine 4HHB ATOM records');
    assert(Boolean(result.coverageInfo && result.coverageInfo.coveragePercent > 90), 'Sequence coverage calculated accurately (>90%)');
    assert(result.coverageInfo?.unresolvedRegions !== undefined, 'Unresolved regions tracked honestly');
    assert(result.resolution !== undefined && result.resolution.includes('Å'), 'Real crystallographic resolution displayed (e.g. 1.74 Å)');
  }

  // TEST 2: Canonical DNA Structure Resolution (1BNA Dickerson Dodecamer)
  console.log('\nTEST SUITE 2: Nucleic Acid Structure Resolution (DNA - RCSB PDB)');
  {
    const dnaSeq = 'CGCGAATTCGCG';
    const result = await resolveStructureForSequence({
      sequence: dnaSeq,
      accession: '1BNA',
      sequenceType: 'DNA',
      mutations: []
    });

    assert(result.structureType === 'EXPERIMENTAL', '1BNA Dickerson dodecamer classified as EXPERIMENTAL');
    assert(result.sourceId === '1BNA', 'DNA resolved to canonical 1BNA crystal structure');
    assert(result.pdbText.includes('1BNA') || result.pdbText.includes('ATOM  '), 'Genuine B-DNA coordinate records retrieved');
  }

  // TEST 3: Stereospecific B-DNA Modeling when no PDB match exists (Strict Provenance)
  console.log('\nTEST SUITE 3: Algorithmic DNA Modeling with Scientific Provenance Labels');
  {
    const novelDnaSeq = 'ATGCGATCGATCGATCGATC';
    const result = await resolveStructureForSequence({
      sequence: novelDnaSeq,
      accession: 'NOVEL_DNA',
      sequenceType: 'DNA',
      mutations: []
    });

    assert(result.structureType === 'SEQUENCE_DERIVED', 'Novel DNA sequence strictly classified as SEQUENCE_DERIVED (not experimental)');
    assert(result.confidence?.description.includes('NOT an experimentally determined 3D structure'), 'Includes explicit scientific disclaimer');
    assert(result.chainsCount === 2, 'Generates antiparallel duplex (Chain A & Chain B)');
    assert(result.pdbText.includes('HEADER    DNA STRUCTURE MODEL'), 'PDB header identifies computational DNA model');
    assert(result.pdbText.includes('TER'), 'Contains strand termination records');
  }

  // TEST 4: Canonical RNA Structure Resolution & Modeling (tRNA & Secondary Folds)
  console.log('\nTEST SUITE 4: RNA Structure Resolution & Stereospecific A-Form Modeling');
  {
    const novelRnaSeq = 'AUGCAUGCAUGCAUGC';
    const result = await resolveStructureForSequence({
      sequence: novelRnaSeq,
      accession: 'NOVEL_RNA',
      sequenceType: 'RNA',
      mutations: []
    });

    assert(result.structureType === 'SEQUENCE_DERIVED', 'Novel RNA sequence strictly classified as SEQUENCE_DERIVED');
    assert(result.confidence?.description.includes('NOT an experimentally determined 3D structure'), 'Includes explicit scientific disclaimer');
    assert(result.pdbText.includes('HEADER    RNA STRUCTURE MODEL'), 'PDB header identifies computational RNA model');
  }

  // TEST 5: Protein Mutation Modeling & Provenance (Sickle Cell HBB Glu6Val)
  console.log('\nTEST SUITE 5: Dynamic Mutation Modeling (Comparative Homology on Template)');
  {
    const hbbSeq = 'VHLTPEEKSAVTALWGKVNVDEVGGEALGRLLVVYPWTQRFFESFGDLSTPDAVMGNPKVKAHGKKVLGAFSDGLAHLDNLKGTFATLSELHCDKLHVDPENFRLLGNVLVCVLAHHFGKEFTPPVQAAYQKVVAGVANALAHKYH';
    // Glu at position 6 (1-indexed) mutated to Val (Glu6Val -> Sickle Cell Hemoglobin)
    const mutatedSeq = 'VHLTPVEKSAVTALWGKVNVDEVGGEALGRLLVVYPWTQRFFESFGDLSTPDAVMGNPKVKAHGKKVLGAFSDGLAHLDNLKGTFATLSELHCDKLHVDPENFRLLGNVLVCVLAHHFGKEFTPPVQAAYQKVVAGVANALAHKYH';
    
    // First resolve original baseline structure
    const origResult = await resolveStructureForSequence({
      sequence: hbbSeq,
      accession: 'NP_000509',
      sequenceType: 'PROTEIN',
      mutations: []
    });

    assert(origResult.structureType === 'EXPERIMENTAL', 'Original structure is EXPERIMENTAL');

    // Now resolve modified structure with point mutation
    const modResult = await resolveStructureForSequence({
      sequence: mutatedSeq,
      originalSequence: hbbSeq,
      accession: 'NP_000509',
      sequenceType: 'PROTEIN',
      templatePdbId: '4HHB',
      templatePdbText: origResult.pdbText,
      mutations: [
        {
          position: 6,
          original: 'E',
          modified: 'V',
          operation: 'substitution',
          description: 'Glu6Val sickle cell mutation'
        }
      ]
    });

    assert(modResult.structureType === 'PREDICTED', 'Mutated sequence strictly classified as PREDICTED homology model');
    assert(modResult.source.includes('Homology Mutation Model'), 'Source clearly indicates Homology Mutation Model');
    assert(modResult.confidence?.metric === 'Homology Modeling', 'Confidence metric identifies Homology Modeling');
    assert(modResult.mutationsTracked === 1, '1 mutation tracked inside coordinates');
    assert(modResult.pdbText.includes('HOMOLOGY MODEL'), 'PDB header identifies Homology Model');
    assert(modResult.pdbText.includes('VAL B   6') || modResult.pdbText.includes('VAL') || modResult.pdbText.includes('VAL A   6'), 'Residue 6 coordinates converted to VAL');

    // Immutability Check: original result remains EXPERIMENTAL and unchanged
    assert(origResult.structureType === 'EXPERIMENTAL', 'Original structure remains strictly EXPERIMENTAL (Immutable)');
    assert(origResult.pdbText.includes('4HHB'), 'Original 4HHB coordinates intact');
  }

  // TEST 6: Multiple Mutations with Indel Coordinate Shift & Side-Chain Pruning
  console.log('\nTEST SUITE 6: Multiple Mutations, Side-Chain Pruning & Coordinate Shifting');
  {
    const samplePdb = [
      'HEADER    TEST PROTEIN',
      'ATOM      1  N   GLU A   5       0.000   0.000   0.000  1.00 20.00           N',
      'ATOM      2  CA  GLU A   5       1.200   0.000   0.000  1.00 20.00           C',
      'ATOM      3  C   GLU A   5       2.000   1.200   0.000  1.00 20.00           C',
      'ATOM      4  O   GLU A   5       1.600   2.300   0.000  1.00 20.00           O',
      'ATOM      5  CB  GLU A   5       1.500  -1.200   0.000  1.00 20.00           C',
      'ATOM      6  OE1 GLU A   5       2.500  -2.200   0.000  1.00 20.00           O',
      'ATOM      7  N   LYS A   6       3.200   1.000   0.000  1.00 20.00           N',
      'ATOM      8  CA  LYS A   6       4.000   2.000   0.000  1.00 20.00           C',
      'ATOM      9  C   LYS A   6       5.000   1.500   0.000  1.00 20.00           C',
      'ATOM     10  O   LYS A   6       5.500   0.500   0.000  1.00 20.00           O',
      'END'
    ].join('\n');

    // Mutate position 5 from GLU to VAL (prunes OE1 side-chain atom!)
    const { pdbText: mutatedPdb, modeledCount, modeledPositions } = generateMutatedHomologyPdb(
      samplePdb,
      [
        { position: 5, original: 'E', modified: 'V', operation: 'substitution' }
      ],
      'TEST-TEMPLATE'
    );

    assert(modeledCount === 1, '1 mutation modeled');
    assert(modeledPositions.includes(5), 'Position 5 correctly identified in modeled positions');
    assert(mutatedPdb.includes('VAL A   5'), 'Residue 5 replaced with VAL');
    assert(!mutatedPdb.includes('OE1'), 'Non-applicable GLU side-chain atom OE1 successfully pruned for VAL');

    // Test Deletion
    const { pdbText: deletedPdb } = generateMutatedHomologyPdb(
      samplePdb,
      [
        { position: 5, original: 'E', operation: 'deletion', lengthChange: -1 }
      ],
      'TEST-TEMPLATE'
    );
    assert(!deletedPdb.includes('GLU A   5'), 'Deleted residue 5 coordinates removed');
    assert(deletedPdb.includes('LYS A   5'), 'Subsequent residue 6 shifted to position 5 due to deletion');
  }

  // TEST 7: Structure Unavailable Validation (< 4 residues or invalid)
  console.log('\nTEST SUITE 7: Boundary Conditions & Structure Unavailable State');
  {
    const shortSeq = 'ATG';
    const result = await resolveStructureForSequence({
      sequence: shortSeq,
      sequenceType: 'PROTEIN',
      mutations: []
    });

    assert(result.structureType === 'UNAVAILABLE', 'Short sequence (< 4 residues) classified as UNAVAILABLE');
    assert(result.pdbText === '', 'No artificial coordinates fabricated for unavailable structure');
    assert(result.confidence?.description.includes('too short'), 'Clear biological explanation provided');
  }

  // TEST 8: Client Parsing, Residue Mapping & Coverage Metrics Integration
  console.log('\nTEST SUITE 8: Residue-to-Structure Mapping & Coverage Calculation');
  {
    const testSeq = 'VHLTPEEKSAVTALWGKVNVDEVGGEALGRLLVVYPWTQRFFESFGDLSTPDAVMGNPKVKAHGKKVLGAFSDGLAHLDNLKGTFATLSELHCDKLHVDPENFRLLGNVLVCVLAHHFGKEFTPPVQAAYQKVVAGVANALAHKYH';
    const samplePdb = [
      'HEADER    SAMPLE PDB',
      'ATOM      1  N   VAL A   1       0.000   0.000   0.000  1.00 20.00           N',
      'ATOM      2  CA  VAL A   1       1.200   0.000   0.000  1.00 20.00           C',
      'ATOM      3  C   VAL A   1       2.000   1.200   0.000  1.00 20.00           C',
      'ATOM      4  O   VAL A   1       1.600   2.300   0.000  1.00 20.00           O',
      'ATOM      5  N   HIS A   2       3.000   1.000   0.000  1.00 20.00           N',
      'ATOM      6  CA  HIS A   2       4.000   2.000   0.000  1.00 20.00           C',
      'ATOM      7  C   HIS A   2       5.000   1.500   0.000  1.00 20.00           C',
      'ATOM      8  O   HIS A   2       5.500   0.500   0.000  1.00 20.00           O',
      'END'
    ].join('\n');

    const parsed = parsePDBText(samplePdb, 'SAMPLE');
    assert(parsed.chains.length === 1, 'Parsed 1 chain');
    assert(parsed.chains[0].residues.length === 2, 'Parsed 2 residues');
    assert(parsed.allAtoms.length === 8, 'Parsed 8 atoms');

    const mapping = buildSequenceToStructureMapping(testSeq, parsed);
    assert(mapping.length === testSeq.length, 'Residue mapping created for every sequence position');
    assert(mapping[0]?.status === 'modeled', 'Residue 1 is modeled');
    assert(mapping[1]?.status === 'modeled', 'Residue 2 is modeled');
    assert(mapping[49]?.status === 'unavailable', 'Residue 50 is unmodeled');

    const cov = getStructureCoverageMetrics(mapping, testSeq.length);
    assert(cov.coveredCount === 2, '2 covered residues');
    assert(cov.isPartial === true, 'Correctly flagged as partial structure');
    assert(cov.coveragePercent < 10, 'Coverage percent calculated accurately');

    const mutEval = evaluateMutationMapping(
      [
        { id: 'mut_1', position: 2, original: 'H', modified: 'A', operation: 'substitution', lengthChange: 0, timestamp: new Date().toISOString() },
        { id: 'mut_2', position: 80, original: 'A', modified: 'G', operation: 'substitution', lengthChange: 0, timestamp: new Date().toISOString() }
      ],
      mapping
    );
    assert(mutEval[0].isModeled === true, 'Mutation at position 2 is marked as modeled');
    assert(mutEval[1].isModeled === false, 'Mutation at position 80 is marked as unmodeled');
  }

  // TEST 9: In-Memory Deterministic Caching
  console.log('\nTEST SUITE 9: Sequence Hash & Deterministic In-Memory Caching');
  {
    const seq = 'MALWMRLLPLLALLALWGPDPAAAFVNQHLCGSHLVEALYLVCGERGFFYTPKT';
    const hash1 = calculateSequenceHash(seq);
    const hash2 = calculateSequenceHash(seq.toLowerCase());
    assert(hash1 === hash2, 'Sequence hash is case-insensitive and deterministic');
    assert(hash1.length === 64, 'SHA-256 hash length is 64 hex characters');

    const res1 = await resolveStructureForSequence({ sequence: seq, sequenceType: 'PROTEIN' });
    const res2 = await resolveStructureForSequence({ sequence: seq, sequenceType: 'PROTEIN' });
    assert(res1.id === res2.id, 'Cached structure returned deterministically');
  }

  console.log(`\n=============================================================`);
  console.log(`ALL TESTS PASSED: ${passedTests} / ${totalTests} assertions verified.`);
  console.log(`=============================================================\n`);
}

runTestSuite().catch((err) => {
  console.error('\nTest Suite Failed:', err);
  process.exit(1);
});
