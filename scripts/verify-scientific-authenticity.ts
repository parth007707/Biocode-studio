import { detectSequence } from '../src/lib/bio/sequenceDetector';
import { parseAndValidateFasta } from '../src/lib/bio/sequenceParser';
import { resolveStructureForSequence } from '../src/server/structureService';

async function runScientificAuthenticityTests() {
  console.log('===============================================================');
  console.log('🧪 BioCode Studio: Scientific Authenticity Verification Suite');
  console.log('===============================================================\n');

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

  // TEST 1: Molecule Classification of NM_007294.4
  console.log('--- Test 1: Authoritative Molecule Classification for RefSeq Transcripts ---');
  const nmDetection = detectSequence(
    'ATGGATTTATCTGCTCTTCGCGTTGAAGAAGTACAAAATGTCATTAATGCTATGCAGAAAATCTTAGAGTGTCCCATCTGTCTGGAGTTGATCAAGGAACCTGTCTCCACAAAGTGTGACCACATATTTTGCAAATTTTGCATGCTGAAACTTCTCAACCAGAAGAAAGGGCCTTCACAGTGTCCTTTATGTAAGAATGATATAACCAAAAGG',
    {
      accession: 'NM_007294.4',
      database: 'NCBI'
    } as any,
    '>NM_007294.4 Homo sapiens BRCA1 DNA repair associated, transcript variant 1, mRNA'
  );
  assert(nmDetection.detectedType === 'RNA', 'NM_007294.4 classified as RNA', `Got: ${nmDetection.detectedType}`);
  assert(nmDetection.biologicalClassification?.molecule_type === 'mRNA', 'NM_007294.4 molecule_type identified as mRNA', `Got: ${nmDetection.biologicalClassification?.molecule_type}`);
  assert(nmDetection.biologicalClassification?.sequence_type === 'mRNA Transcript', 'NM_007294.4 sequence_type identified as mRNA Transcript', `Got: ${nmDetection.biologicalClassification?.sequence_type}`);

  // TEST 2: FASTA Parser preserves mRNA Transcript classification
  console.log('\n--- Test 2: FASTA Parser RefSeq mRNA Classification ---');
  const fastaParsed = parseAndValidateFasta('>NM_007294.4 Homo sapiens BRCA1 mRNA transcript variant 1\nATGGATTTATCTGCTCTTCGCGTTGAAGAAGTA', 'AUTO');
  assert(fastaParsed.type === 'RNA', 'FASTA parser identifies NM_ header as RNA in AUTO mode', `Got: ${fastaParsed.type}`);

  // TEST 3: NM_007294.4 3D Structure Resolution returns UNAVAILABLE (No fake coordinates)
  console.log('\n--- Test 3: NM_007294.4 mRNA 3D Resolution Integrity ---');
  const nmStructure = await resolveStructureForSequence({
    sequence: 'ATGGATTTATCTGCTCTTCGCGTTGAAGAAGTACAAAATGTCATTAATGCTATGCAGAAAATCTTAGAGTGTCCCATCTGTCTGGAGTTGATCAAGGAACCTGTCTCCACAAAGTGTGACCACATATTTTGCAAATTTTGCATGCTGAAACTTCTCAACCAGAAGAAAGGGCCTTCACAGTGTCCTTTATGTAAGAATGATATAACCAAAAGG',
    sequenceType: 'RNA',
    accession: 'NM_007294.4',
    sequenceId: 'nm_007294_test',
    allowSequenceDerivedFallback: false
  });
  assert(nmStructure.structureType === 'UNAVAILABLE', 'NM_007294.4 returns UNAVAILABLE status', `Got: ${nmStructure.structureType}`);
  assert(nmStructure.pdbText === '', 'NM_007294.4 does NOT synthesize fake atom coordinates', `pdbText length: ${nmStructure.pdbText.length}`);
  assert(
    nmStructure.confidence.description.includes('mRNA') || nmStructure.confidence.description.includes('BRCA1') || nmStructure.confidence.description.includes('RCSB PDB'),
    'NM_007294.4 provides honest explanation referencing translated protein coordinates',
    nmStructure.confidence.description
  );

  // TEST 4: Arbitrary Synthetic Protein with no PDB/AlphaFold returns UNAVAILABLE
  console.log('\n--- Test 4: Arbitrary Protein Resolution with biological integrity ---');
  const arbitrarySeq = 'MQQYYFFCCWVPLLLLKKMMQQYYFFCCWVPLLLLKKMMQQYYFFCCWVPLLLLKKMMQQYYFFCCWVPLLLLKK';
  const arbitraryResult = await resolveStructureForSequence({
    sequence: arbitrarySeq,
    sequenceType: 'PROTEIN',
    accession: 'CUSTOM_SYNTHETIC_PEPTIDE_XYZ',
    sequenceId: 'synth_test',
    allowSequenceDerivedFallback: false
  });
  assert(arbitraryResult.structureType === 'UNAVAILABLE', 'Arbitrary unknown sequence returns UNAVAILABLE when allowSequenceDerivedFallback is false', `Got: ${arbitraryResult.structureType}`);
  assert(arbitraryResult.pdbText === '', 'Arbitrary unknown sequence does not synthesize fake coordinates', `pdbText length: ${arbitraryResult.pdbText.length}`);

  // TEST 5: Translated BRCA1 Protein Domain (1JM7) returns EXPERIMENTAL with Genuine Coordinates
  console.log('\n--- Test 5: Translated BRCA1 Protein Domain (1JM7) ---');
  const brca1Protein = await resolveStructureForSequence({
    sequence: 'MDLSALRVEEVQNVINAMQKILECPICLELIKEPVSTKCDHIFCKFCMLKLLNQKKGPSQCPLC',
    sequenceType: 'PROTEIN',
    accession: '1JM7',
    sequenceId: 'brca1_protein_test',
    allowSequenceDerivedFallback: false
  });
  assert(brca1Protein.structureType === 'EXPERIMENTAL', '1JM7 returns EXPERIMENTAL status', `Got: ${brca1Protein.structureType}`);
  assert(brca1Protein.sourceId === '1JM7', '1JM7 sourceId is correct', `Got: ${brca1Protein.sourceId}`);
  assert(brca1Protein.pdbText.length > 500, '1JM7 provides genuine PDB coordinates', `pdbText length: ${brca1Protein.pdbText.length}`);
  assert(brca1Protein.coverageInfo !== undefined && brca1Protein.coverageInfo.coveredResiduesCount > 0, '1JM7 has valid coverageInfo mapping', `Covered residues: ${brca1Protein.coverageInfo?.coveredResiduesCount}`);

  // TEST 6: Genuine DNA Coordinates (1BNA Dickerson Dodecamer)
  console.log('\n--- Test 6: Genuine Experimental DNA Structure (1BNA) ---');
  const dnaResult = await resolveStructureForSequence({
    sequence: 'CGCGAATTCGCG',
    sequenceType: 'DNA',
    accession: '1BNA',
    sequenceId: '1bna_test',
    allowSequenceDerivedFallback: false
  });
  assert(dnaResult.structureType === 'EXPERIMENTAL', '1BNA returns EXPERIMENTAL status', `Got: ${dnaResult.structureType}`);
  assert(dnaResult.sourceId === '1BNA', '1BNA sourceId is 1BNA', `Got: ${dnaResult.sourceId}`);
  assert(dnaResult.pdbText.includes('ATOM') && dnaResult.pdbText.includes('DNA'), '1BNA contains genuine atomic coordinates for DNA', `Found ATOM records in PDB`);

  // TEST 7: Mutation Pipeline & Immutability (4HHB Glu6Val)
  console.log('\n--- Test 7: Mutation Modeling on Experimental Structure (4HHB Glu6Val) ---');
  const origHbb = await resolveStructureForSequence({
    sequence: 'VHLTPEEKSAVTALWGKVNVDEVGGEALGRLLVVYPWTQRFFESFGDLSTPDAVMGNPKVKAHGKKVLGAFSDGLAHLDNLKGTFATLSELHCDKLHVDPENFRLLGNVLVCVLAHHFGKEFTPPVQAAYQKVVAGVANALAHKYH',
    sequenceType: 'PROTEIN',
    accession: '4HHB',
    sequenceId: 'hbb_orig',
    allowSequenceDerivedFallback: false
  });
  assert(origHbb.structureType === 'EXPERIMENTAL', 'Baseline 4HHB returns EXPERIMENTAL', `Got: ${origHbb.structureType}`);

  const mutHbb = await resolveStructureForSequence({
    sequence: 'VHLTPVEKSAVTALWGKVNVDEVGGEALGRLLVVYPWTQRFFESFGDLSTPDAVMGNPKVKAHGKKVLGAFSDGLAHLDNLKGTFATLSELHCDKLHVDPENFRLLGNVLVCVLAHHFGKEFTPPVQAAYQKVVAGVANALAHKYH',
    sequenceType: 'PROTEIN',
    accession: '4HHB',
    sequenceId: 'hbb_mut',
    originalSequence: 'VHLTPEEKSAVTALWGKVNVDEVGGEALGRLLVVYPWTQRFFESFGDLSTPDAVMGNPKVKAHGKKVLGAFSDGLAHLDNLKGTFATLSELHCDKLHVDPENFRLLGNVLVCVLAHHFGKEFTPPVQAAYQKVVAGVANALAHKYH',
    templatePdbId: '4HHB',
    templatePdbText: origHbb.pdbText,
    mutations: [{
      position: 6,
      original: 'E',
      modified: 'V',
      operation: 'SUBSTITUTION',
      description: 'E6V Sickle Cell Mutation',
      lengthChange: 0
    }],
    allowSequenceDerivedFallback: false
  });

  assert(mutHbb.structureType === 'PREDICTED', 'Modified structure is modeled as PREDICTED/HOMOLOGY_MODEL', `Got: ${mutHbb.structureType}`);
  assert(mutHbb.mutationsTracked === 1, '1 mutation tracked in 3D coordinate model', `Got: ${mutHbb.mutationsTracked}`);
  assert(origHbb.pdbText !== mutHbb.pdbText, 'Original and modified structures have distinct coordinates', 'Original coords remain immutable');
  assert(origHbb.pdbText.includes('GLU B   6'), 'Original structure contains GLU at position 6', 'GLU B 6 confirmed');
  assert(mutHbb.pdbText.includes('VAL B   6'), 'Modified structure contains mutated VAL at position 6', 'VAL B 6 confirmed');

  console.log('\n===============================================================');
  console.log(`Results: ${passes} Passed, ${failures} Failed`);
  console.log('===============================================================\n');

  if (failures > 0) {
    process.exit(1);
  }
}

runScientificAuthenticityTests().catch(e => {
  console.error('Fatal test error:', e);
  process.exit(1);
});
