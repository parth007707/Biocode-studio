export interface RNAPair {
  from: number; // 0-based index
  to: number;
  type: 'AU' | 'GC' | 'GU';
}

export interface RNASecondaryStructureResult {
  sequence: string;
  length: number;
  gcPercentage: number;
  auPercentage: number;
  purinePercentage: number;
  pyrimidinePercentage: number;
  dotBracket: string;
  pairs: RNAPair[];
  stemCount: number;
  loopCount: number;
  estimatedFreeEnergyKcal: number; // Delta G estimate in kcal/mol
  stems: Array<{
    start5: number;
    end5: number;
    start3: number;
    end3: number;
    length: number;
    basePairs: string[];
  }>;
  hairpins: Array<{
    loopStart: number;
    loopEnd: number;
    loopSequence: string;
    closingPair: [number, number];
  }>;
}

// Can pair test: Watson-Crick (A-U, G-C) and Wobble (G-U)
function isBasePair(b1: string, b2: string): 'AU' | 'GC' | 'GU' | null {
  const pair = `${b1}${b2}`;
  if (pair === 'AU' || pair === 'UA') return 'AU';
  if (pair === 'GC' || pair === 'CG') return 'GC';
  if (pair === 'GU' || pair === 'UG') return 'GU';
  return null;
}

export function predictRNASecondaryStructure(seq: string): RNASecondaryStructureResult {
  const clean = seq.toUpperCase().replace(/[^ACGU]/g, '');
  const n = clean.length;

  let gc = 0;
  let au = 0;
  let purines = 0;
  let pyrimidines = 0;

  for (let i = 0; i < n; i++) {
    const base = clean[i];
    if (base === 'G' || base === 'C') gc++;
    if (base === 'A' || base === 'U') au++;
    if (base === 'A' || base === 'G') purines++;
    if (base === 'C' || base === 'U') pyrimidines++;
  }

  const gcPct = n > 0 ? Number(((gc / n) * 100).toFixed(1)) : 0;
  const auPct = n > 0 ? Number(((au / n) * 100).toFixed(1)) : 0;
  const purinePct = n > 0 ? Number(((purines / n) * 100).toFixed(1)) : 0;
  const pyrimidinePct = n > 0 ? Number(((pyrimidines / n) * 100).toFixed(1)) : 0;

  if (n < 6) {
    return {
      sequence: clean,
      length: n,
      gcPercentage: gcPct,
      auPercentage: auPct,
      purinePercentage: purinePct,
      pyrimidinePercentage: pyrimidinePct,
      dotBracket: '.'.repeat(n),
      pairs: [],
      stemCount: 0,
      loopCount: 0,
      estimatedFreeEnergyKcal: 0,
      stems: [],
      hairpins: []
    };
  }

  // Nussinov algorithm for secondary structure prediction with minimum loop length of 3
  // Bound folding matrix to structural domain window (max 120 nt) to prevent O(N^3) main-thread lockup
  const maxFoldLength = 120;
  const foldSeq = clean.slice(0, maxFoldLength);
  const foldN = foldSeq.length;

  const minLoop = 3;
  const dp: number[][] = Array.from({ length: foldN }, () => Array(foldN).fill(0));

  for (let span = minLoop + 1; span < foldN; span++) {
    for (let i = 0; i < foldN - span; i++) {
      const j = i + span;
      let maxScore = dp[i][j - 1]; // Unpaired j

      for (let k = i; k < j - minLoop; k++) {
        const pairType = isBasePair(foldSeq[k], foldSeq[j]);
        if (pairType) {
          const bonus = pairType === 'GC' ? 3 : pairType === 'AU' ? 2 : 1;
          const left = k > i ? dp[i][k - 1] : 0;
          const inside = dp[k + 1][j - 1];
          const score = left + inside + bonus;
          if (score > maxScore) {
            maxScore = score;
          }
        }
      }
      dp[i][j] = maxScore;
    }
  }

  // Backtracking to find base pairs
  const pairs: RNAPair[] = [];
  const traceback = (i: number, j: number) => {
    if (i >= j - minLoop) return;

    if (dp[i][j] === dp[i][j - 1]) {
      traceback(i, j - 1);
      return;
    }

    for (let k = i; k < j - minLoop; k++) {
      const pairType = isBasePair(foldSeq[k], foldSeq[j]);
      if (pairType) {
        const bonus = pairType === 'GC' ? 3 : pairType === 'AU' ? 2 : 1;
        const left = k > i ? dp[i][k - 1] : 0;
        const inside = dp[k + 1][j - 1];
        if (dp[i][j] === left + inside + bonus) {
          pairs.push({ from: k, to: j, type: pairType });
          if (k > i) traceback(i, k - 1);
          traceback(k + 1, j - 1);
          return;
        }
      }
    }
  };

  traceback(0, foldN - 1);

  // Construct dot bracket string
  const dotBracketArr = Array(n).fill('.');
  for (const pair of pairs) {
    dotBracketArr[pair.from] = '(';
    dotBracketArr[pair.to] = ')';
  }
  const dotBracket = dotBracketArr.join('');

  // Extract stems and hairpins
  pairs.sort((a, b) => a.from - b.from);
  
  // Calculate approximate delta G (Turner energy parameters simplified)
  // GC pair ~ -3.0 kcal/mol, AU ~ -2.0 kcal/mol, GU ~ -0.9 kcal/mol, loop penalty ~ +3.5 kcal/mol
  let freeEnergy = 0;
  for (const p of pairs) {
    if (p.type === 'GC') freeEnergy -= 3.0;
    else if (p.type === 'AU') freeEnergy -= 2.0;
    else if (p.type === 'GU') freeEnergy -= 0.9;
  }

  const stems: Array<{
    start5: number;
    end5: number;
    start3: number;
    end3: number;
    length: number;
    basePairs: string[];
  }> = [];

  const hairpins: Array<{
    loopStart: number;
    loopEnd: number;
    loopSequence: string;
    closingPair: [number, number];
  }> = [];

  // Group contiguous pairs into stems
  let currentStem: RNAPair[] = [];
  for (let i = 0; i < pairs.length; i++) {
    const p = pairs[i];
    if (currentStem.length === 0) {
      currentStem.push(p);
    } else {
      const last = currentStem[currentStem.length - 1];
      if (p.from === last.from + 1 && p.to === last.to - 1) {
        currentStem.push(p);
      } else {
        if (currentStem.length >= 1) {
          const firstP = currentStem[0];
          const lastP = currentStem[currentStem.length - 1];
          stems.push({
            start5: firstP.from + 1,
            end5: lastP.from + 1,
            start3: lastP.to + 1,
            end3: firstP.to + 1,
            length: currentStem.length,
            basePairs: currentStem.map(cp => `${clean[cp.from]}-${clean[cp.to]}`)
          });
          // Check if inner pair forms a hairpin loop
          if (lastP.to - lastP.from - 1 >= 3) {
            hairpins.push({
              loopStart: lastP.from + 2,
              loopEnd: lastP.to,
              loopSequence: clean.substring(lastP.from + 1, lastP.to),
              closingPair: [lastP.from + 1, lastP.to + 1]
            });
            freeEnergy += 3.5; // Loop destabilizing penalty
          }
        }
        currentStem = [p];
      }
    }
  }

  if (currentStem.length >= 1) {
    const firstP = currentStem[0];
    const lastP = currentStem[currentStem.length - 1];
    stems.push({
      start5: firstP.from + 1,
      end5: lastP.from + 1,
      start3: lastP.to + 1,
      end3: firstP.to + 1,
      length: currentStem.length,
      basePairs: currentStem.map(cp => `${clean[cp.from]}-${clean[cp.to]}`)
    });
    if (lastP.to - lastP.from - 1 >= 3) {
      hairpins.push({
        loopStart: lastP.from + 2,
        loopEnd: lastP.to,
        loopSequence: clean.substring(lastP.from + 1, lastP.to),
        closingPair: [lastP.from + 1, lastP.to + 1]
      });
      freeEnergy += 3.5;
    }
  }

  return {
    sequence: clean,
    length: n,
    gcPercentage: gcPct,
    auPercentage: auPct,
    purinePercentage: purinePct,
    pyrimidinePercentage: pyrimidinePct,
    dotBracket,
    pairs,
    stemCount: stems.length,
    loopCount: hairpins.length,
    estimatedFreeEnergyKcal: Number(freeEnergy.toFixed(1)),
    stems,
    hairpins
  };
}
