import { DatabaseSourceMeta, DatabaseCategory, DatabaseSourceId } from '../../../services/adapters/types';

export interface DatabaseCategoryInfo {
  id: DatabaseCategory;
  name: string;
  shortDesc: string;
  sources: DatabaseSourceMeta[];
}

export const DATABASE_SOURCES: DatabaseSourceMeta[] = [
  // ===================== NCBI =====================
  {
    id: 'ncbi-nucleotide',
    name: 'Nucleotide',
    category: 'NCBI',
    categoryLabel: 'NCBI Entrez Databases',
    description: 'GenBank, RefSeq, and DDBJ genomic DNA, cDNA transcripts, plasmids, and synthetic constructs.',
    badge: 'GenBank / RefSeq',
    apiProvider: 'NCBI Entrez E-Utilities (esearch/efetch)',
    endpointUrl: 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=nucleotide',
    docUrl: 'https://www.ncbi.nlm.nih.gov/nucleotide/',
    supportedFormats: ['FASTA', 'GenBank (flatfile)', 'XML', 'JSON'],
    sampleQueries: [
      { label: 'Human Beta-Globin (HBB)', query: 'NM_000518', description: 'Homo sapiens hemoglobin subunit beta mRNA (626 bp)' },
      { label: 'Human Chromosome 17', query: 'NC_060941.1', description: 'Homo sapiens isolate CHM13 chromosome 17 (84.3 Mb Genomic DNA)' },
      { label: 'SARS-CoV-2 Complete Genome', query: 'NC_045512', description: 'Severe acute respiratory syndrome coronavirus 2 isolate (29.9 kb)' },
      { label: 'Human Tumor Suppressor TP53', query: 'NM_000546', description: 'Homo sapiens tumor protein p53 transcript variant 1 (2.5 kb)' }
    ],
    queryFields: [
      { name: 'term', label: 'Search Query / Accession ID / Gene Symbol', type: 'text', placeholder: 'e.g. NM_000518 or "BRCA1[Gene]"' },
      { name: 'organism', label: 'Organism Filter (Optional)', type: 'text', placeholder: 'e.g. Homo sapiens, Mus musculus' },
      { 
        name: 'sort', 
        label: 'Sort Results', 
        type: 'select', 
        defaultValue: 'relevance',
        options: [
          { label: 'Relevance', value: 'relevance' },
          { label: 'Publication Date', value: 'pub_date' },
          { label: 'Organism Name', value: 'organism' }
        ]
      }
    ]
  },
  {
    id: 'ncbi-protein',
    name: 'Protein',
    category: 'NCBI',
    categoryLabel: 'NCBI Entrez Databases',
    description: 'Non-redundant protein sequences from RefSeq, GenPept, Swiss-Prot, PIR, PRF, and PDB.',
    badge: 'RefSeq / GenPept',
    apiProvider: 'NCBI Entrez E-Utilities (esearch/efetch)',
    endpointUrl: 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=protein',
    docUrl: 'https://www.ncbi.nlm.nih.gov/protein/',
    supportedFormats: ['FASTA', 'GenPept', 'XML', 'JSON'],
    sampleQueries: [
      { label: 'Human Insulin Precursor', query: 'NP_000198', description: 'Insulin preproprotein [Homo sapiens]' },
      { label: 'p53 Tumor Suppressor', query: 'NP_000537', description: 'Cellular tumor antigen p53 [Homo sapiens]' },
      { label: 'Green Fluorescent Protein (GFP)', query: 'AAB08058', description: 'GFP from Aequorea victoria' }
    ],
    queryFields: [
      { name: 'term', label: 'Protein Accession / Keyword', type: 'text', placeholder: 'e.g. NP_000198 or "hemoglobin subunit"' },
      { name: 'organism', label: 'Organism (Optional)', type: 'text', placeholder: 'e.g. Homo sapiens' }
    ]
  },
  {
    id: 'ncbi-gene',
    name: 'Gene',
    category: 'NCBI',
    categoryLabel: 'NCBI Entrez Databases',
    description: 'Curated gene records integrating genomic loci, transcript isoforms, phenotypes, and orthologs.',
    badge: 'Entrez Gene',
    apiProvider: 'NCBI Entrez E-Utilities',
    endpointUrl: 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=gene',
    docUrl: 'https://www.ncbi.nlm.nih.gov/gene/',
    supportedFormats: ['Gene Report', 'Tabular', 'XML'],
    sampleQueries: [
      { label: 'Human BRCA1 Gene', query: '672', description: 'BRCA1 DNA repair associated [GeneID: 672]' },
      { label: 'Human ACE2 Receptor', query: '59272', description: 'Angiotensin converting enzyme 2 [GeneID: 59272]' },
      { label: 'Human MYC Proto-oncogene', query: '4609', description: 'MYC proto-oncogene, bHLH transcription factor' }
    ],
    queryFields: [
      { name: 'term', label: 'Gene Symbol / Gene ID / Disease', type: 'text', placeholder: 'e.g. BRCA1 or 672' },
      { name: 'organism', label: 'Organism Filter', type: 'text', placeholder: 'e.g. Homo sapiens' }
    ]
  },
  {
    id: 'ncbi-genome',
    name: 'Genome',
    category: 'NCBI',
    categoryLabel: 'NCBI Entrez Databases',
    description: 'Sequenced organisms, complete nuclear and organellar genomes, and chromosome maps.',
    badge: 'NCBI Genome',
    apiProvider: 'NCBI Entrez E-Utilities',
    endpointUrl: 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=genome',
    docUrl: 'https://www.ncbi.nlm.nih.gov/genome/',
    supportedFormats: ['GBFF', 'GFF3', 'FASTA', 'JSON'],
    sampleQueries: [
      { label: 'Homo sapiens (Human)', query: 'Homo sapiens[Organism]', description: 'Human reference genome assembly GRCh38' },
      { label: 'Saccharomyces cerevisiae', query: 'Saccharomyces cerevisiae[Organism]', description: 'Baker’s yeast reference strain S288C' },
      { label: 'Drosophila melanogaster', query: 'Drosophila melanogaster[Organism]', description: 'Fruit fly reference genome' }
    ],
    queryFields: [
      { name: 'term', label: 'Organism Name / Taxonomy ID', type: 'text', placeholder: 'e.g. "Homo sapiens" or 9606' }
    ]
  },
  {
    id: 'ncbi-assembly',
    name: 'Assembly',
    category: 'NCBI',
    categoryLabel: 'NCBI Entrez Databases',
    description: 'Genome assembly structures, contig/scaffold statistics, and RefSeq/GenBank alignments.',
    badge: 'NCBI Assembly',
    apiProvider: 'NCBI Entrez E-Utilities',
    endpointUrl: 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=assembly',
    docUrl: 'https://www.ncbi.nlm.nih.gov/assembly/',
    supportedFormats: ['Assembly Report', 'Stats JSON'],
    sampleQueries: [
      { label: 'GRCh38.p14 Reference', query: 'GCF_000001405.40', description: 'Genome Reference Consortium Human Build 38 patch 14' },
      { label: 'T2T-CHM13v2.0 Telomere-to-Telomere', query: 'GCF_009914755.1', description: 'Gapless human genome reference assembly' }
    ],
    queryFields: [
      { name: 'term', label: 'Assembly Accession / Organism', type: 'text', placeholder: 'e.g. GCF_000001405.40' }
    ]
  },
  {
    id: 'ncbi-taxonomy',
    name: 'Taxonomy',
    category: 'NCBI',
    categoryLabel: 'NCBI Entrez Databases',
    description: 'Curated classification of organisms with formal nomenclature and complete lineage hierarchies.',
    badge: 'NCBI Taxonomy',
    apiProvider: 'NCBI Entrez E-Utilities',
    endpointUrl: 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=taxonomy',
    docUrl: 'https://www.ncbi.nlm.nih.gov/taxonomy/',
    supportedFormats: ['Lineage XML', 'JSON'],
    sampleQueries: [
      { label: 'Homo sapiens (TaxID 9606)', query: '9606', description: 'Eukaryota > Metazoa > Chordata > Primates > Hominidae' },
      { label: 'Escherichia coli (TaxID 562)', query: '562', description: 'Bacteria > Pseudomonadota > Gammaproteobacteria > Enterobacterales' },
      { label: 'Arabidopsis thaliana (TaxID 3702)', query: '3702', description: 'Eukaryota > Viridiplantae > Streptophyta > Brassicaceae' }
    ],
    queryFields: [
      { name: 'term', label: 'Organism / Common Name / TaxID', type: 'text', placeholder: 'e.g. 9606 or "Homo sapiens"' }
    ]
  },

  // ===================== BLAST =====================
  {
    id: 'blast-nucleotide',
    name: 'Nucleotide Search',
    category: 'BLAST',
    categoryLabel: 'Basic Local Alignment Search Tool',
    description: 'Execute BLASTN to find regions of local similarity between nucleotide sequences against GenBank collections.',
    badge: 'BLASTN Suite',
    apiProvider: 'NCBI QBLAST REST API',
    endpointUrl: 'https://blast.ncbi.nlm.nih.gov/Blast.cgi?CMD=Put&PROGRAM=blastn',
    docUrl: 'https://blast.ncbi.nlm.nih.gov/Blast.cgi?PAGE_TYPE=BlastSearch',
    supportedFormats: ['Pairwise Text', 'Hit Table (TSV)', 'XML2', 'JSON'],
    sampleQueries: [
      { label: 'Hemoglobin Exon Probe', query: 'ATGGTGCACCTGACTCCTGAGGAGAAGTCTGCCGTTACTGCCCTGTGGGGCAAG', description: 'Human HBB exon 1 54-bp fragment' },
      { label: 'E. coli 16S rRNA Primer', query: 'AGAGTTTGATCCTGGCTCAG', description: 'Universal 27F bacterial 16S ribosomal RNA primer' }
    ],
    queryFields: [
      { name: 'sequence', label: 'Query Nucleotide Sequence (FASTA or raw)', type: 'text', placeholder: 'Paste DNA/RNA query sequence...' },
      { 
        name: 'database', 
        label: 'Target Database', 
        type: 'select', 
        defaultValue: 'nt',
        options: [
          { label: 'Nucleotide collection (nr/nt)', value: 'nt' },
          { label: 'RefSeq RNA sequences (refseq_rna)', value: 'refseq_rna' },
          { label: 'Genomic Reference Assemblies', value: 'refseq_genomic' },
          { label: 'Expressed Sequence Tags (est)', value: 'est' }
        ]
      },
      { name: 'expectThreshold', label: 'Expect Threshold (E-value)', type: 'number', defaultValue: 10 }
    ]
  },
  {
    id: 'blast-protein',
    name: 'Protein Search',
    category: 'BLAST',
    categoryLabel: 'Basic Local Alignment Search Tool',
    description: 'Execute BLASTP to search protein databases using amino acid queries to discover homologous domains and orthologs.',
    badge: 'BLASTP Suite',
    apiProvider: 'NCBI QBLAST REST API',
    endpointUrl: 'https://blast.ncbi.nlm.nih.gov/Blast.cgi?CMD=Put&PROGRAM=blastp',
    docUrl: 'https://blast.ncbi.nlm.nih.gov/Blast.cgi?PAGE_TYPE=BlastSearch&PROGRAM=blastp',
    supportedFormats: ['Pairwise Text', 'Hit Table (TSV)', 'XML2', 'JSON'],
    sampleQueries: [
      { label: 'Insulin B-Chain Core', query: 'FVNQHLCGSHLVEALYLVCGERGFFYTPKT', description: 'Homo sapiens insulin B-chain active sequence' },
      { label: 'Ubiquitin Conserved Motif', query: 'MQIFVKTLTGKTITLEVEPSDTIENVKAKIQDKEGIPPDQQRLIFAGKQLEDGRTLSDYNIQKESTLHLVLRLRGG', description: 'Human ubiquitin 76-residue invariant peptide' }
    ],
    queryFields: [
      { name: 'sequence', label: 'Query Polypeptide Sequence (FASTA or raw)', type: 'text', placeholder: 'Paste amino acid sequence...' },
      { 
        name: 'database', 
        label: 'Target Protein Database', 
        type: 'select', 
        defaultValue: 'nr',
        options: [
          { label: 'Non-redundant protein sequences (nr)', value: 'nr' },
          { label: 'UniProtKB / Swiss-Prot (swissprot)', value: 'swissprot' },
          { label: 'Protein Data Bank proteins (pdb)', value: 'pdb' },
          { label: 'RefSeq Protein (refseq_protein)', value: 'refseq_protein' }
        ]
      },
      { 
        name: 'matrix', 
        label: 'Scoring Matrix', 
        type: 'select', 
        defaultValue: 'BLOSUM62',
        options: [
          { label: 'BLOSUM62 (Standard)', value: 'BLOSUM62' },
          { label: 'BLOSUM45 (Divergent sequences)', value: 'BLOSUM45' },
          { label: 'BLOSUM80 (Closely related sequences)', value: 'BLOSUM80' },
          { label: 'PAM30 (Short queries)', value: 'PAM30' }
        ]
      }
    ]
  },

  // ===================== UniProt =====================
  {
    id: 'uniprot-protein',
    name: 'Protein Database',
    category: 'UniProt',
    categoryLabel: 'Universal Protein Resource',
    description: 'Manually annotated and reviewed Swiss-Prot protein knowledgebase with active site, domain, and post-translational modification annotations.',
    badge: 'UniProtKB / Swiss-Prot',
    apiProvider: 'UniProt REST API v2',
    endpointUrl: 'https://rest.uniprot.org/uniprotkb/search',
    docUrl: 'https://www.uniprot.org/',
    supportedFormats: ['FASTA', 'JSON', 'GFF', 'XML'],
    sampleQueries: [
      { label: 'Human Hemoglobin subunit beta (HBB)', query: 'P68871', description: 'UniProtKB Reviewed Swiss-Prot Entry P68871' },
      { label: 'Human Caspase-3 (CASP3)', query: 'P42574', description: 'Apoptosis executioner caspase in Homo sapiens' },
      { label: 'Spike Glycoprotein (SARS-CoV-2)', query: 'P0DTC2', description: 'Coronaviral spike surface glycoprotein' },
      { label: 'Human Cytochrome c (CYCS)', query: 'P99999', description: 'Electron transport and intrinsic apoptosis mediator' }
    ],
    queryFields: [
      { name: 'query', label: 'UniProtKB Accession / Protein / Gene Name', type: 'text', placeholder: 'e.g. P68871 or "human telomerase"' },
      { name: 'organism', label: 'Organism Filter', type: 'text', placeholder: 'e.g. 9606 or Homo sapiens' },
      { 
        name: 'reviewedOnly', 
        label: 'Reviewed Status', 
        type: 'select', 
        defaultValue: 'true',
        options: [
          { label: 'Swiss-Prot only (Reviewed high-quality)', value: 'true' },
          { label: 'All UniProtKB (Reviewed + TrEMBL)', value: 'false' }
        ]
      }
    ]
  },

  // ===================== RCSB PDB =====================
  {
    id: 'pdb-dna',
    name: 'DNA Structures',
    category: 'RCSB_PDB',
    categoryLabel: 'RCSB Protein Data Bank',
    description: 'Experimentally determined 3D atomic coordinates of DNA duplexes, quadruplexes, and nucleic acid complexes.',
    badge: 'RCSB PDB DNA',
    apiProvider: 'RCSB PDB Search API & Data API',
    endpointUrl: 'https://search.rcsb.org/rcsbsearch/v2/query',
    docUrl: 'https://www.rcsb.org/',
    supportedFormats: ['mmCIF', 'PDB', 'FASTA', 'Structure 3D (GLTF)'],
    sampleQueries: [
      { label: 'Dickerson B-DNA Dodecamer (1BNA)', query: '1BNA', description: 'CGCGAATTCGCG crystal structure (1.9 Å resolution)' },
      { label: 'Human Telomeric G-Quadruplex (143D)', query: '143D', description: 'NMR structure of d[AGGG(TTAGGG)3] in Na+ solution' },
      { label: 'EcoRI Endonuclease-DNA Complex (1CKQ)', query: '1CKQ', description: 'Type II restriction enzyme bound to cognate DNA' }
    ],
    queryFields: [
      { name: 'query', label: 'PDB ID / Nucleic Acid Keyword', type: 'text', placeholder: 'e.g. 1BNA or "G-quadruplex"' },
      { 
        name: 'experimentalMethod', 
        label: 'Experimental Method', 
        type: 'select', 
        defaultValue: 'ALL',
        options: [
          { label: 'All Methods', value: 'ALL' },
          { label: 'X-ray Diffraction', value: 'X-RAY DIFFRACTION' },
          { label: 'Cryo-Electron Microscopy', value: 'ELECTRON MICROSCOPY' },
          { label: 'Solution NMR', value: 'SOLUTION NMR' }
        ]
      }
    ]
  },
  {
    id: 'pdb-rna',
    name: 'RNA Structures',
    category: 'RCSB_PDB',
    categoryLabel: 'RCSB Protein Data Bank',
    description: '3D structural assemblies of folded RNA transcripts, transfer RNAs, ribozymes, aptamers, and viral RNA elements.',
    badge: 'RCSB PDB RNA',
    apiProvider: 'RCSB PDB Search API & Data API',
    endpointUrl: 'https://search.rcsb.org/rcsbsearch/v2/query',
    docUrl: 'https://www.rcsb.org/',
    supportedFormats: ['mmCIF', 'PDB', 'FASTA'],
    sampleQueries: [
      { label: 'Yeast tRNA Phe Crystal Structure (1EHZ)', query: '1EHZ', description: 'Transfer RNA crystal structure at 1.93 Å' },
      { label: 'Hepatitis Delta Virus Ribozyme (1DRZ)', query: '1DRZ', description: 'Self-cleaving catalytic RNA structure' },
      { label: 'SAM-I Riboswitch (2GIS)', query: '2GIS', description: 'S-adenosylmethionine sensing regulatory RNA' }
    ],
    queryFields: [
      { name: 'query', label: 'PDB ID / RNA Keyword', type: 'text', placeholder: 'e.g. 1EHZ or "riboswitch"' }
    ]
  },
  {
    id: 'pdb-protein',
    name: 'Protein Structures',
    category: 'RCSB_PDB',
    categoryLabel: 'RCSB Protein Data Bank',
    description: 'High-resolution 3D coordinate archives of enzyme active sites, membrane receptors, antibodies, and macromolecular complexes.',
    badge: 'RCSB PDB Protein',
    apiProvider: 'RCSB PDB Search API & Data API',
    endpointUrl: 'https://search.rcsb.org/rcsbsearch/v2/query',
    docUrl: 'https://www.rcsb.org/',
    supportedFormats: ['mmCIF', 'PDB', 'FASTA'],
    sampleQueries: [
      { label: 'Sperm Whale Myoglobin (1MBO)', query: '1MBO', description: 'Classic oxygen-binding hemeprotein at 1.6 Å' },
      { label: 'SARS-CoV-2 Main Protease Mpro (6LU7)', query: '6LU7', description: 'Key antiviral drug target crystal structure' },
      { label: 'CRISPR-Cas9 Complex (4UN3)', query: '4UN3', description: 'Streptococcus pyogenes Cas9 with sgRNA and target DNA' }
    ],
    queryFields: [
      { name: 'query', label: 'PDB ID / Protein Keyword / Organism', type: 'text', placeholder: 'e.g. 6LU7 or "hemoglobin"' }
    ]
  },

  // ===================== FASTA Import =====================
  {
    id: 'fasta-import',
    name: 'Upload FASTA File',
    category: 'FASTA_IMPORT',
    categoryLabel: 'File Ingestion Pipeline',
    description: 'Import local biological sequence files (.fasta, .fa, .fna, .faa, .txt) with automated multi-record extraction and validation.',
    badge: 'Local Upload',
    apiProvider: 'BioCode Client File Parser',
    endpointUrl: 'local://fasta-ingest',
    docUrl: 'https://en.wikipedia.org/wiki/FASTA_format',
    supportedFormats: ['.fasta', '.fa', '.fna', '.faa', '.seq', '.txt'],
    sampleQueries: [],
    queryFields: []
  },

  // ===================== Custom Sequence =====================
  {
    id: 'custom-sequence',
    name: 'Paste Custom Sequence',
    category: 'CUSTOM_SEQUENCE',
    categoryLabel: 'Direct Input Workbench',
    description: 'Enter raw DNA, RNA, or polypeptide amino acid sequences with automated molecular classification and 3D structural rendering.',
    badge: 'Direct Input',
    apiProvider: 'BioCode Sequence Intelligence Engine',
    endpointUrl: 'local://workbench-intelligence',
    docUrl: '#',
    supportedFormats: ['Raw Residues', 'FASTA String', 'Multi-line IUPAC'],
    sampleQueries: [],
    queryFields: []
  }
];

export const DATABASE_CATEGORIES: DatabaseCategoryInfo[] = [
  {
    id: 'NCBI',
    name: 'NCBI',
    shortDesc: 'National Center for Biotechnology Information',
    sources: DATABASE_SOURCES.filter((s) => s.category === 'NCBI')
  },
  {
    id: 'BLAST',
    name: 'BLAST',
    shortDesc: 'Basic Local Alignment Search Tool',
    sources: DATABASE_SOURCES.filter((s) => s.category === 'BLAST')
  },
  {
    id: 'UniProt',
    name: 'UniProt',
    shortDesc: 'Universal Protein Knowledgebase',
    sources: DATABASE_SOURCES.filter((s) => s.category === 'UniProt')
  },
  {
    id: 'RCSB_PDB',
    name: 'RCSB PDB',
    shortDesc: 'Macromolecular 3D Structure Archive',
    sources: DATABASE_SOURCES.filter((s) => s.category === 'RCSB_PDB')
  },
  {
    id: 'FASTA_IMPORT',
    name: 'FASTA Import',
    shortDesc: 'Local Biological File Ingestion',
    sources: DATABASE_SOURCES.filter((s) => s.category === 'FASTA_IMPORT')
  },
  {
    id: 'CUSTOM_SEQUENCE',
    name: 'Custom Sequence',
    shortDesc: 'Interactive Sequence Analysis Workbench',
    sources: DATABASE_SOURCES.filter((s) => s.category === 'CUSTOM_SEQUENCE')
  }
];
