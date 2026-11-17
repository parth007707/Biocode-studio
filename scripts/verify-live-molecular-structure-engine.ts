import { 
  resolveStructureForSequence, 
  startStructurePredictionJob, 
  getStructurePredictionJob 
} from '../src/server/structureService';
import { parsePDBText } from '../src/lib/bio/structure3d/pdbParser';
import { calculateDistanceAngstrom } from '../src/lib/bio/structure3d/distanceEngine';
import { SequenceMutation } from '../src/lib/bio/editor/types';

let passed = 0;
let failed = 0;

function check(desc: string, condition: boolean, extra?: any) {
  if (condition) {
    console.log(`  ✓ ${desc}`);
    passed++;
  } else {
    console.error(`  ✗ ${desc}`, extra ? extra : '');
    failed++;
    throw new Error(`Verification assertion failed: ${desc}`);
  }
}

async function run() {
  console.log('\n================================================================');
  console.log('BIOCODE STUDIO — LIVE MOLECULAR STRUCTURE ENGINE VERIFICATION');
  console.log('================================================================\n');

  // 1. Protein Sequence to Biological Structure Pipeline (4HHB / NP_000509)
  console.log('1. Protein Sequence-to-Structure Pipeline (Human Beta-Globin)');
  {
    const hbbSeq = 'VHLTPEEKSAVTALWGKVNVDEVGGEALGRLLVVYPWTQRFFESFGDLSTPDAVMGNPKVKAHGKKVLGAFSDGLAHLDNLKGTFATLSELHCDKLHVDPENFRLLGNVLVCVLAHHFGKEFTPPVQAAYQKVVAGVANALAHKYH';
    const result = await resolveStructureForSequence({
      sequence: hbbSeq,
      accession: 'NP_000509',
      sequenceType: 'PROTEIN',
      mutations: []
    });

    check('Resolved to genuine RCSB PDB crystal structure (4HHB)', result.sourceId === '4HHB');
    check('PDB text has valid coordinates', result.pdbText.length > 5000 && result.pdbText.includes('ATOM'));
    
    // Parse into macromolecular coordinates
    const parsed = parsePDBText(result.pdbText, '4HHB_TEST');
    const allResidues = parsed.chains.flatMap(c => c.residues);
    check('Parsed atoms count > 1000', parsed.allAtoms.length > 1000);
    check('Parsed residues count > 140', allResidues.length > 140);
    check('Contains valid protein chains', parsed.chains.length > 0);

    // Verify covalent peptide and side-chain bonds
    let covalentBondsCount = 0;
    for (const chain of parsed.chains) {
      for (const res of chain.residues) {
        // Test internal residue covalent bonds (0.95 to 1.95 A)
        const atoms = res.atoms;
        for (let i = 0; i < atoms.length; i++) {
          for (let j = i + 1; j < atoms.length; j++) {
            const d = calculateDistanceAngstrom(atoms[i], atoms[j]);
            if (d >= 0.95 && d <= 1.95) covalentBondsCount++;
          }
        }
      }
    }
    check('Computed covalent chemical bonds for Ball & Stick (> 800)', covalentBondsCount > 800);
  }

  // 2. DNA Structure Pipeline (1BNA Dickerson Dodecamer)
  console.log('\n2. DNA Structure Pipeline (1BNA Crystal Coordinates)');
  {
    const dnaSeq = 'CGCGAATTCGCG';
    const result = await resolveStructureForSequence({
      sequence: dnaSeq,
      accession: '1BNA',
      sequenceType: 'DNA',
      mutations: []
    });

    check('DNA resolved to 1BNA crystal structure', result.sourceId === '1BNA');
    const parsed = parsePDBText(result.pdbText, '1BNA_TEST');
    check('1BNA contains nucleic acid atoms (> 400)', parsed.allAtoms.length > 400);
    check('1BNA contains phosphorus atoms for nucleotide backbone', parsed.allAtoms.some(a => a.element === 'P'));
  }

  // 3. RNA Structure Pipeline (1EHZ Yeast tRNA Phe)
  console.log('\n3. RNA Structure Pipeline (1EHZ tRNA Crystal Coordinates)');
  {
    const rnaSeq = 'GCGGAUUUAGCUCAGUUGGGAGAGCGCCAGACUGAAGAUCUGGAGGUCCUGUGUUCGAUCCACAGAAUUCGCA';
    const result = await resolveStructureForSequence({
      sequence: rnaSeq,
      accession: '1EHZ',
      sequenceType: 'RNA',
      mutations: []
    });

    check('RNA resolved to 1EHZ structure', result.sourceId === '1EHZ');
    const parsed = parsePDBText(result.pdbText, '1EHZ_TEST');
    check('1EHZ parsed atoms > 1000', parsed.allAtoms.length > 1000);
    check('1EHZ contains ribonucleotide chains', parsed.chains.length > 0);
  }

  // 4. Asynchronous Prediction Job Lifecycle
  console.log('\n4. Asynchronous Structure Prediction Job Lifecycle');
  {
    const job = startStructurePredictionJob({
      sequence: 'MVLSPADKTNVKAAWGKVGAHAGEYGAEALERMFLSFPTTKTYFPHFDLSHGSAQVKGHGKKVADALTNAVAHVDDMPNALSALSDLHAHKLRVDPVNFKLLSHCLLVTLAAHLPAEFTPAVHASLDKFLASVSTVLTSKYR',
      sequenceType: 'PROTEIN',
      accession: '2HHB'
    });

    check('Prediction job created with unique job ID', Boolean(job.jobId && job.jobId.startsWith('job_struct_')));
    check('Initial status is queued or processing', job.status === 'queued' || job.status === 'processing');

    // Wait for asynchronous job execution with polling
    let poll = getStructurePredictionJob(job.jobId);
    for (let i = 0; i < 50 && poll?.status === 'processing'; i++) {
      await new Promise((res) => setTimeout(res, 250));
      poll = getStructurePredictionJob(job.jobId);
    }

    check('Job retrieved by ID', poll !== null);
    console.log('    [Debug Job]', { status: poll?.status, progress: poll?.progress, phase: poll?.phase, error: poll?.error });
    check('Job status is completed', poll?.status === 'completed');
    check('Job progress reached 100%', poll?.progress === 100);
    check('Job result contains valid 3D structure with coordinates', Boolean(poll?.structure && poll.structure.pdbText.length > 1000));
  }

  // 5. Molecular Mutagenesis with Side-Chain Pruning (Glu6Val / E6V Sickle Cell)
  console.log('\n5. Molecular Mutagenesis & Side-Chain Pruning (Glu6Val)');
  {
    const origSeq = 'VHLTPEEKSAVTALWGKVNVDEVGGEALGRLLVVYPWTQRFFESFGDLSTPDAVMGNPKVKAHGKKVLGAFSDGLAHLDNLKGTFATLSELHCDKLHVDPENFRLLGNVLVCVLAHHFGKEFTPPVQAAYQKVVAGVANALAHKYH';
    const modSeq  = 'VHLTPVEKSAVTALWGKVNVDEVGGEALGRLLVVYPWTQRFFESFGDLSTPDAVMGNPKVKAHGKKVLGAFSDGLAHLDNLKGTFATLSELHCDKLHVDPENFRLLGNVLVCVLAHHFGKEFTPPVQAAYQKVVAGVANALAHKYH';
    
    const mutation: SequenceMutation = {
      id: 'mut_e6v',
      position: 6,
      original: 'E',
      modified: 'V',
      operation: 'substitution',
      lengthChange: 0,
      timestamp: new Date().toISOString()
    };

    const mutResult = await resolveStructureForSequence({
      sequence: modSeq,
      accession: 'NP_000509',
      sequenceType: 'PROTEIN',
      mutations: [mutation],
      originalSequence: origSeq
    });

    check('Modified structure generated via comparative homology', mutResult.structureType === 'PREDICTED');
    check('Classification honestly labels mutated model as PREDICTED (not experimental)', mutResult.structureType === 'PREDICTED' && mutResult.predictionMethod?.includes('Homology Modeling'));

    // Verify residue 6 is mutated to VAL in PDB text
    const parsedMut = parsePDBText(mutResult.pdbText, 'MUT_TEST');
    const allMutResidues = parsedMut.chains.flatMap(c => c.residues);
    const res6 = allMutResidues.find(r => r.resSeq === 6);
    check('Residue 6 exists in mutated structure', Boolean(res6));
    check('Residue 6 code3 is VAL', res6?.name === 'VAL');
    
    // Verify side-chain pruning: Glu OE1, OE2, CD atoms pruned, backbone & CB preserved
    const res6AtomNames = (res6?.atoms || []).map(a => a.name);
    check('Residue 6 preserves backbone CA atom', res6AtomNames.includes('CA'));
    check('Residue 6 preserves beta carbon CB atom', res6AtomNames.includes('CB'));
    check('Residue 6 OE1 atom successfully pruned (no phantom atoms)', !res6AtomNames.includes('OE1'));
    check('Residue 6 OE2 atom successfully pruned (no phantom atoms)', !res6AtomNames.includes('OE2'));
    check('Residue 6 CD atom successfully pruned', !res6AtomNames.includes('CD'));
  }

  // 6. Dual Model Separation & Immutability
  console.log('\n6. Dual Model Separation & Original Sequence Immutability');
  {
    const origSeq = 'VHLTPEEKSAVTALWGKVNVDEVGGEALGRLLVVYPWTQRFFESFGDLSTPDAVMGNPKVKAHGKKVLGAFSDGLAHLDNLKGTFATLSELHCDKLHVDPENFRLLGNVLVCVLAHHFGKEFTPPVQAAYQKVVAGVANALAHKYH';

    const origModel = await resolveStructureForSequence({
      sequence: origSeq,
      accession: 'NP_000509',
      sequenceType: 'PROTEIN',
      mutations: []
    });

    const parsedOrig = parsePDBText(origModel.pdbText, 'ORIG');
    const betaChain = parsedOrig.chains.find(c => c.id === 'B') || parsedOrig.chains[0];
    const origBetaRes6 = betaChain?.residues.find(r => r.resSeq === 6);

    check('Original baseline structure preserved as GLU at pos 6 in beta-chain', origBetaRes6?.name === 'GLU');
    check('Original structure remains canonical EXPERIMENTAL 4HHB', origModel.sourceId === '4HHB');
  }

  console.log('\n================================================================');
  console.log(`ALL VERIFICATION CHECKS PASSED: ${passed} passed, ${failed} failed.`);
  console.log('================================================================\n');
}

run().catch((err) => {
  console.error('Verification error:', err);
  process.exit(1);
});
