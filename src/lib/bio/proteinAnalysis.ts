export interface AminoAcidComposition {
  length: number;
  molecularWeightDa: number;
  molecularWeightKDa: number;
  isoelectricPoint: number; // pI
  netChargeAtPh7: number;
  gravyScore: number; // Grand average of hydropathy
  hydrophobicCount: number;
  hydrophobicPercentage: number;
  polarCount: number;
  polarPercentage: number;
  positivelyChargedCount: number;
  negativelyChargedCount: number;
  counts: Record<string, number>;
  percentages: Record<string, number>;
  predictedSecondaryStructure: {
    helixPropensity: number;
    sheetPropensity: number;
    coilPropensity: number;
    dominantConformation: 'Alpha-Helix' | 'Beta-Sheet' | 'Random Coil' | 'Mixed';
  };
}

// Average amino acid molecular weights (g/mol or Da) minus H2O (18.015 Da) for peptide bond condensation
const AA_WEIGHTS: Record<string, number> = {
  A: 71.08,  R: 156.20, N: 114.11, D: 115.09, C: 103.14,
  E: 129.12, Q: 128.13, G: 57.05,  H: 137.14, I: 113.17,
  L: 113.17, K: 128.18, M: 131.21, F: 147.18, P: 97.12,
  S: 87.08,  T: 101.11, W: 186.21, Y: 163.18, V: 99.13,
  U: 150.04, O: 237.30
};

// Kyte-Doolittle hydropathy scale
const HYDROPATHY_SCALE: Record<string, number> = {
  I: 4.5, V: 4.2, L: 3.8, F: 2.8, C: 2.5,
  M: 1.9, A: 1.8, G: -0.4, T: -0.7, S: -0.8,
  W: -0.9, Y: -1.3, P: -1.6, H: -3.2, E: -3.5,
  Q: -3.5, D: -3.5, N: -3.5, K: -3.9, R: -4.5
};

// Chou-Fasman secondary structure propensities
const HELIX_PROPENSITY: Record<string, number> = {
  E: 1.51, M: 1.45, A: 1.42, L: 1.21, K: 1.16,
  F: 1.13, Q: 1.11, W: 1.08, I: 1.08, V: 1.06,
  D: 1.01, H: 1.00, R: 0.98, T: 0.83, S: 0.77,
  C: 0.70, Y: 0.69, N: 0.67, P: 0.57, G: 0.57
};

const SHEET_PROPENSITY: Record<string, number> = {
  V: 1.70, I: 1.60, Y: 1.47, F: 1.38, W: 1.37,
  L: 1.30, C: 1.19, T: 1.19, Q: 1.10, M: 1.05,
  R: 0.93, N: 0.89, H: 0.87, A: 0.83, S: 0.75,
  G: 0.75, K: 0.74, P: 0.55, D: 0.54, E: 0.37
};

// pKa values for isoelectric point calculation (EMBOSS scale)
const PK_N_TERM = 8.6;
const PK_C_TERM = 3.6;
const PK_SIDE_CHAINS: Record<string, number> = {
  C: 8.5,
  D: 3.9,
  E: 4.1,
  H: 6.5,
  K: 10.8,
  R: 12.5,
  Y: 10.1
};

export function calculateNetCharge(seq: string, pH: number): number {
  let charge = 0;
  // N-terminus
  charge += 1 / (1 + Math.pow(10, pH - PK_N_TERM));
  // C-terminus
  charge -= 1 / (1 + Math.pow(10, PK_C_TERM - pH));

  for (let i = 0; i < seq.length; i++) {
    const aa = seq[i];
    if (aa === 'K' || aa === 'R' || aa === 'H') {
      const pKa = PK_SIDE_CHAINS[aa];
      charge += 1 / (1 + Math.pow(10, pH - pKa));
    } else if (aa === 'D' || aa === 'E' || aa === 'C' || aa === 'Y') {
      const pKa = PK_SIDE_CHAINS[aa];
      charge -= 1 / (1 + Math.pow(10, pKa - pH));
    }
  }
  return charge;
}

export function calculateIsoelectricPoint(seq: string): number {
  // Pre-count charged residues in single pass O(N)
  const counts: Record<string, number> = { K: 0, R: 0, H: 0, D: 0, E: 0, C: 0, Y: 0 };
  for (let i = 0; i < seq.length; i++) {
    const aa = seq[i];
    if (aa in counts) counts[aa]++;
  }

  const evalCharge = (pH: number) => {
    let charge = 0;
    charge += 1 / (1 + Math.pow(10, pH - PK_N_TERM));
    charge -= 1 / (1 + Math.pow(10, PK_C_TERM - pH));
    charge += counts.K * (1 / (1 + Math.pow(10, pH - PK_SIDE_CHAINS.K)));
    charge += counts.R * (1 / (1 + Math.pow(10, pH - PK_SIDE_CHAINS.R)));
    charge += counts.H * (1 / (1 + Math.pow(10, pH - PK_SIDE_CHAINS.H)));
    charge -= counts.D * (1 / (1 + Math.pow(10, PK_SIDE_CHAINS.D - pH)));
    charge -= counts.E * (1 / (1 + Math.pow(10, PK_SIDE_CHAINS.E - pH)));
    charge -= counts.C * (1 / (1 + Math.pow(10, PK_SIDE_CHAINS.C - pH)));
    charge -= counts.Y * (1 / (1 + Math.pow(10, PK_SIDE_CHAINS.Y - pH)));
    return charge;
  };

  let minPH = 0;
  let maxPH = 14;
  const precision = 0.01;

  while (maxPH - minPH > precision) {
    const midPH = (minPH + maxPH) / 2;
    const charge = evalCharge(midPH);
    if (charge > 0) {
      minPH = midPH;
    } else {
      maxPH = midPH;
    }
  }

  return Number(((minPH + maxPH) / 2).toFixed(2));
}

export function analyzeProteinSequence(seq: string): AminoAcidComposition {
  const upper = seq.toUpperCase().replace(/[^ACDEFGHIKLMNPQRSTVWY]/g, '');
  const length = upper.length;

  const counts: Record<string, number> = {};
  const percentages: Record<string, number> = {};

  const allAA = 'ACDEFGHIKLMNPQRSTVWY';
  for (const aa of allAA) {
    counts[aa] = 0;
  }

  let totalWeight = length > 0 ? 18.015 : 0; // Terminal H + OH
  let totalHydropathy = 0;
  let hydrophobicCount = 0;
  let polarCount = 0;
  let positiveCount = 0;
  let negativeCount = 0;
  let totalHelixScore = 0;
  let totalSheetScore = 0;

  const hydrophobicAA = new Set(['A', 'V', 'I', 'L', 'M', 'F', 'W', 'P']);
  const polarAA = new Set(['S', 'T', 'C', 'Y', 'N', 'Q']);
  const positiveAA = new Set(['K', 'R', 'H']);
  const negativeAA = new Set(['D', 'E']);

  for (let i = 0; i < length; i++) {
    const aa = upper[i];
    counts[aa] = (counts[aa] || 0) + 1;
    totalWeight += AA_WEIGHTS[aa] || 110;
    totalHydropathy += HYDROPATHY_SCALE[aa] || 0;
    totalHelixScore += HELIX_PROPENSITY[aa] || 1.0;
    totalSheetScore += SHEET_PROPENSITY[aa] || 1.0;

    if (hydrophobicAA.has(aa)) hydrophobicCount++;
    if (polarAA.has(aa)) polarCount++;
    if (positiveAA.has(aa)) positiveCount++;
    if (negativeAA.has(aa)) negativeCount++;
  }

  for (const aa of allAA) {
    percentages[aa] = length > 0 ? Number(((counts[aa] / length) * 100).toFixed(1)) : 0;
  }

  const pI = length > 0 ? calculateIsoelectricPoint(upper) : 7.0;
  const netChargeAtPh7 = length > 0 ? Number(calculateNetCharge(upper, 7.4).toFixed(2)) : 0;
  const gravy = length > 0 ? Number((totalHydropathy / length).toFixed(2)) : 0;

  const avgHelix = length > 0 ? totalHelixScore / length : 1.0;
  const avgSheet = length > 0 ? totalSheetScore / length : 1.0;
  const avgCoil = 1.0;

  let dominantConformation: 'Alpha-Helix' | 'Beta-Sheet' | 'Random Coil' | 'Mixed' = 'Mixed';
  if (avgHelix > 1.15 && avgHelix > avgSheet) {
    dominantConformation = 'Alpha-Helix';
  } else if (avgSheet > 1.15 && avgSheet > avgHelix) {
    dominantConformation = 'Beta-Sheet';
  } else if (avgHelix < 0.95 && avgSheet < 0.95) {
    dominantConformation = 'Random Coil';
  }

  return {
    length,
    molecularWeightDa: Math.round(totalWeight),
    molecularWeightKDa: Number((totalWeight / 1000).toFixed(2)),
    isoelectricPoint: pI,
    netChargeAtPh7,
    gravyScore: gravy,
    hydrophobicCount,
    hydrophobicPercentage: length > 0 ? Number(((hydrophobicCount / length) * 100).toFixed(1)) : 0,
    polarCount,
    polarPercentage: length > 0 ? Number(((polarCount / length) * 100).toFixed(1)) : 0,
    positivelyChargedCount: positiveCount,
    negativelyChargedCount: negativeCount,
    counts,
    percentages,
    predictedSecondaryStructure: {
      helixPropensity: Number(avgHelix.toFixed(2)),
      sheetPropensity: Number(avgSheet.toFixed(2)),
      coilPropensity: Number(avgCoil.toFixed(2)),
      dominantConformation
    }
  };
}
