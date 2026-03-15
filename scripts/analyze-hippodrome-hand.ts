/**
 * Analyze a real hand from the Hippodrome £1/2 with straddles.
 *
 * Hand: Hero UTG+2 with JJ, raises to 30 over a double straddle (10).
 * Two callers: BTN + blind. Flop: A-T-7 (test rainbow, two-tone, monotone).
 * Hero c-bets 30. Question: is that right? Should hero x/give up or bet small?
 *
 * Since the solver only handles HU, we run pairwise:
 *   1. Hero (UTG) vs BTN — Hero is OOP
 *   2. Hero (UTG) vs Blind — Hero is IP
 */

import { runSolver, SolverResult, SolveOptions } from '../app/lib/solver/solver-bridge';
import { lookupRange } from '../app/lib/solver/ranges';
import { SolverInput } from '../app/lib/solver/ohh-to-solver';

// ---------------------------------------------------------------------------
// Hand parameters
// ---------------------------------------------------------------------------

// £1/2, straddle 5, double straddle 10. Hero raises to 30, 2 callers.
// Pot at flop ≈ 30*3 + dead money (folded straddles/blinds) ≈ 105
// Effective stack: £200 start (100BB at £1/2) - £30 preflop = £170

const POT_AT_FLOP = 105;
const EFF_STACK = 170;

const BOARDS: Record<string, string[]> = {
  'AT7 rainbow':   ['Ah', 'Tc', '7d'],
  'AT7 two-tone':  ['Ah', 'Th', '7d'],
  'AT7 monotone':  ['Ah', 'Th', '7h'],
};

// Ranges
const heroRange = lookupRange('tag', 'UTG', 'rfi')!;
// BTN fish cold-calling UTG open
const btnFishColdCall = '22-TT,A2s-AQs,ATo-AQo,K9s+,KTo+,Q9s+,QTo+,J9s+,JTo,T8s+,T9o,98s,87s,76s,65s';
// BB fish defending vs UTG
const bbFishDefend = lookupRange('fish', 'BB', 'defend_call', 'UTG')!;

console.log('=== Hippodrome £1/2 — JJ on A-T-7 ===\n');
console.log(`Hero range (TAG UTG RFI): ${heroRange}`);
console.log(`BTN fish cold-call: ${btnFishColdCall}`);
console.log(`BB fish defend: ${bbFishDefend}`);
console.log(`Pot: £${POT_AT_FLOP}  |  Eff stack: £${EFF_STACK}  |  SPR: ${(EFF_STACK/POT_AT_FLOP).toFixed(1)}`);
console.log();

interface Scenario {
  name: string;
  board: string[];
  oopRange: string;
  ipRange: string;
  heroIsOOP: boolean;
}

const scenarios: Scenario[] = [];
for (const [boardName, board] of Object.entries(BOARDS)) {
  scenarios.push({
    name: `Hero(OOP) vs BTN — ${boardName}`,
    board,
    oopRange: heroRange,
    ipRange: btnFishColdCall,
    heroIsOOP: true,
  });
  scenarios.push({
    name: `Hero(IP) vs BB — ${boardName}`,
    board,
    oopRange: bbFishDefend,
    ipRange: heroRange,
    heroIsOOP: false,
  });
}

// JJ combos in solver notation (descending suit order: s>h>d>c)
const ALL_JJ = ['JsJh', 'JsJd', 'JsJc', 'JhJd', 'JhJc', 'JdJc'];

function getLiveJJ(board: string[]): string[] {
  const boardCards = new Set(board);
  return ALL_JJ.filter(combo => {
    const c1 = combo.slice(0, 2);
    const c2 = combo.slice(2, 4);
    return !boardCards.has(c1) && !boardCards.has(c2);
  });
}

function printStrategy(
  result: SolverResult,
  scenario: Scenario,
) {
  const heroEq = scenario.heroIsOOP ? result.oop_equity : result.ip_equity;
  const heroEv = scenario.heroIsOOP ? result.oop_ev : result.ip_ev;

  // Pick the right strategy map for hero
  let heroActions: string[];
  let heroStrategy: Record<string, Record<string, number>>;

  if (scenario.heroIsOOP) {
    heroActions = result.actions;
    heroStrategy = result.strategy;
  } else {
    // Hero is IP — use ip_strategy if available, otherwise strategy is OOP (villain)
    heroActions = result.ip_actions ?? result.actions;
    heroStrategy = result.ip_strategy ?? {};
  }

  console.log(`  Solve: ${result.solve_time_ms}ms | Exploitability: ${result.exploitability.toFixed(2)}`);
  console.log(`  Hero equity: ${(heroEq * 100).toFixed(1)}% | Hero EV: £${heroEv.toFixed(1)}`);
  console.log(`  Actions: ${heroActions.join(', ')}`);

  // JJ specific
  const liveJJ = getLiveJJ(scenario.board);
  let jjFound = false;
  for (const combo of liveJJ) {
    const strat = heroStrategy[combo];
    if (strat) {
      jjFound = true;
      const formatted = Object.entries(strat)
        .filter(([, freq]) => freq > 0.005)
        .map(([action, freq]) => `${action}: ${(freq * 100).toFixed(0)}%`)
        .join(', ');
      console.log(`  ${combo}: ${formatted}`);
    }
  }
  if (!jjFound) {
    // Search for any JJ-like key
    const jjKeys = Object.keys(heroStrategy).filter(k => k.startsWith('J') && k[2] === 'J');
    if (jjKeys.length > 0) {
      for (const k of jjKeys.slice(0, 3)) {
        const strat = heroStrategy[k];
        const formatted = Object.entries(strat)
          .filter(([, freq]) => freq > 0.005)
          .map(([action, freq]) => `${action}: ${(freq * 100).toFixed(0)}%`)
          .join(', ');
        console.log(`  ${k}: ${formatted}`);
      }
    } else {
      console.log('  (JJ not found in hero strategy)');
    }
  }

  // Overall bet frequency
  const hands = Object.values(heroStrategy);
  if (hands.length > 0) {
    let totalCheck = 0, count = 0;
    for (const strat of hands) {
      totalCheck += strat['Check'] ?? 0;
      count++;
    }
    console.log(`  Range: check ${((totalCheck/count)*100).toFixed(0)}% / bet ${(((count-totalCheck)/count)*100).toFixed(0)}%`);
  }
}

async function main() {
  // Use simpler bet sizes to keep solve times reasonable
  const opts: SolveOptions = {
    betSizes: '33%, 75%, a',
    raiseSizes: '2.5x, a',
    maxIterations: 200,
    targetExploitabilityPct: 0.5,
    timeoutMs: 180_000, // 3 min
  };

  for (const scenario of scenarios) {
    console.log(`\n--- ${scenario.name} ---`);
    console.log(`Board: ${scenario.board.join(' ')}`);

    const input: SolverInput = {
      oopRange: scenario.oopRange,
      ipRange: scenario.ipRange,
      board: scenario.board,
      startingPot: POT_AT_FLOP,
      effectiveStack: EFF_STACK,
      solveStreet: 'Flop',
      actualActions: [],
    };

    try {
      const result = await runSolver(input, opts);
      printStrategy(result, scenario);
    } catch (err: any) {
      console.log(`  ERROR: ${err.message.slice(0, 200)}`);
    }
  }

  console.log('\n\n=== Summary ===');
  console.log('Key question: Should you c-bet JJ on A-T-7 in a 3-way pot?');
  console.log('Look at JJ frequencies above. If GTO says mostly check HU, then 3-way is even more of a check.');
  console.log('The c-bet of £30 into £105 (29%) would correspond to the 33% sizing.');
}

main().catch(console.error);
