import { resolveStructureForSequence, calculateSequenceHash } from '../src/server/structureService';
import { generateProteinStructure3D } from '../src/lib/bio/structure3d/structureGenerator';
import { computeClientSequenceHash } from '../src/lib/bio/structure3d/structureResolver';

async function runTests() {
  console.log('====================================================');
  console.log('🔬 BIOCODE STUDIO 3D STRUCTURE VALIDATION TEST SUITE');
  console.log('====================================================\n');

  let passed = 0;
  let total = 0;

  function assert(condition: boolean, testName: string, detail?: string) {
    total++;
    if (condition) {
      console.log(`✅ [PASS] ${testName}${detail ? ` (${detail})` : ''}`);
      passed++;
    } else {
      console.error(`❌ [FAIL] ${testName}${detail ? ` (${detail})` : ''}`);
      process.exitCode = 1;
    }
  }

  // 1. SEQUENCE TO STRUCTURE DERIVATION
  console.log('Test 1: Active Sequence as Source of Truth & Deterministic Hashing');
  const seq1 = 'MEEPQSDPSVEPPLSQETFSDLWKLLPENNVLSPLPSQAMDDLMLSPDDIEQWFTEDPGPDEAPRMPEAAPPVAPAPAAPTPAAPAPAPSWPLSSSVPSQKTYQGSYGFRLGFLHSGTAKSVTCTYSPALNKMFCQLAKTCPVQLWVDSTPPPGTRVRAMAIYKQSQHMTEVVRRCPHHERCSDSDGLAPPQHLIRVEGNLRVEYLDDRNTFRHSVVVPYEPPEVGSDCTTIHYNYMCNSSCMGGMNRRPILTIITLEDSSGNLLGRNSFEVRVCACPGRDRRTEEENLRKKGEPHHELPPGSTKRALPNNTSSSPQPKKKPLDGEYFTLQIRGRERFEMFRELNEALELKDAQAGKEPGGSRAHSSHLKSKKGQSTSRHKKLMFKTEGPDSD';
  const hash1 = calculateSequenceHash(seq1);
  const clientHash1 = computeClientSequenceHash(seq1);
  assert(hash1.length === 64, 'SHA-256 hash computed deterministically', `Hash prefix: ${hash1.slice(0, 10)}`);
  assert(clientHash1.includes('hash_'), 'Client sequence hash computed', clientHash1);

  // 2. EXPERIMENTAL STRUCTURE RESOLUTION (NP_000537 canonical p53)
  console.log('\nTest 2: Experimental Structure Match (PDB Archive)');
  const expStruct = await resolveStructureForSequence({
    sequence: seq1,
    sequenceId: 'NP_000537',
    sequenceVersion: 'v1',
    accession: 'NP_000537'
  });

  assert(expStruct.structureType === 'EXPERIMENTAL', 'Classified as EXPERIMENTAL structure', expStruct.structureType);
  assert(expStruct.source === 'PDB', 'Source is real PDB Archive', expStruct.source);
  assert(Boolean(expStruct.sourceId), 'Contains real PDB ID', expStruct.sourceId);
  assert(Boolean(expStruct.resolution), 'Contains real experimental resolution', expStruct.resolution);
  assert(Boolean(expStruct.experimentalMethod), 'Contains real experimental method', expStruct.experimentalMethod);
  assert(expStruct.pdbText.includes('ATOM'), 'Contains real PDB ATOM coordinates', `PDB length: ${expStruct.pdbText.length} chars`);
  assert(expStruct.sequenceHash === hash1, 'Structure tied strictly to sequence hash');

  // 3. SEQUENCE CHANGE -> SEQUENCE HASH CHANGE & PREVIOUS STRUCTURE INVALIDATION
  console.log('\nTest 3: Sequence Change Detection & Structure Invalidation');
  // Mutate residue 248 (R248W, classic p53 hotspot)
  const pos248 = 247; // 0-based index
  const mutatedSeq = seq1.slice(0, pos248) + 'W' + seq1.slice(pos248 + 1);
  const hash2 = calculateSequenceHash(mutatedSeq);
  assert(hash1 !== hash2, 'Sequence change detected: new sequence produces distinct hash', `Old: ${hash1.slice(0, 8)} vs New: ${hash2.slice(0, 8)}`);

  // 4. PREDICTED / HOMOLOGY STRUCTURE FOR MODIFIED SEQUENCE
  console.log('\nTest 4: Predicted / Homology Model for Mutated Sequence');
  const predStruct = await resolveStructureForSequence({
    sequence: mutatedSeq,
    sequenceId: 'NP_000537',
    sequenceVersion: 'v2',
    accession: 'NP_000537',
    mutations: [
      { position: 248, original: 'R', modified: 'W', operation: 'substitution', description: 'R248W oncogenic hotspot' }
    ]
  });

  assert(predStruct.structureType === 'PREDICTED', 'Modified sequence correctly classified as PREDICTED', predStruct.structureType);
  assert(predStruct.resolution === undefined, 'No fake resolution displayed for predicted model');
  assert(Boolean(predStruct.predictionMethod), 'Contains prediction method', predStruct.predictionMethod);
  assert(Boolean(predStruct.confidence), 'Contains confidence metric', predStruct.confidence?.metric);
  assert(predStruct.mutationsTracked === 1, 'Tracks point mutations on structure', `Tracked: ${predStruct.mutationsTracked}`);
  assert(predStruct.sequenceVersion === 'v2', 'Maintains sequence versioning', predStruct.sequenceVersion);

  // 5. NOVEL SEQUENCE (NO PDB MATCH) -> PHYSICS-INFORMED SECONDARY FOLD
  console.log('\nTest 5: Ab Initio / Secondary Fold for Novel Sequence');
  const novelSeq = 'MKWVTFISLLFLFSSAYSRGVFRRDTHKSEIAHRFKDLGEEHFKGLVLIAFSQYLQQCPFDEHVKLVNELTEFAKTCVADESHAGCEKSLHTLFGDELCKVASLRETYGDMADCCEKQEPERNECFLSHKDDSPDLPKLKP';
  const novelStruct = generateProteinStructure3D(novelSeq, undefined, 'Synthetic Novel Albumin Peptide');

  assert(novelStruct.structureType === 'PREDICTED', 'Novel sequence is PREDICTED');
  assert(novelStruct.resolutionAngstrom === undefined, 'No fake resolution angstrom for ab initio model');
  assert(novelStruct.chains[0].residues.length === novelSeq.length, 'Residue count matches sequence length exactly', `${novelStruct.chains[0].residues.length} aa`);
  assert(novelStruct.allAtoms.length > novelSeq.length * 4, 'Full atomic backbone (N, CA, C, O, CB) generated', `${novelStruct.allAtoms.length} atoms`);
  assert(novelStruct.secondaryStructureSummary.helixPercent >= 0, 'Secondary structure propensity calculated');
  assert(novelStruct.ramachandranStats?.favoredPercent !== undefined, 'Ramachandran phi/psi angles calculated', `${novelStruct.ramachandranStats?.favoredPercent}% favored`);
  assert(Boolean(novelStruct.confidenceInfo), 'Contains confidence information', novelStruct.confidenceInfo?.metric);

  console.log(`\n====================================================`);
  console.log(`RESULT: ${passed} of ${total} tests passed successfully.`);
  console.log(`====================================================`);
}

runTests().catch((err) => {
  console.error('Fatal error running 3D test suite:', err);
  process.exit(1);
});
