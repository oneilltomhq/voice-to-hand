/**
 * Eval scoring framework for voice-to-hand pipeline.
 *
 * Compares a produced OHH state against a golden reference across
 * multiple dimensions, each scored independently.
 */

import type { OHHData, Action, Round, Player } from "../../app/lib/OpenHandHistory";

export interface DimensionScore {
  dimension: string;
  score: number; // 0.0 – 1.0
  maxScore: number; // always 1.0 for normalisation
  details: string; // human-readable explanation of deductions
}

export interface EvalResult {
  caseId: string;
  overall: number; // weighted average of dimension scores
  dimensions: DimensionScore[];
  errors: string[]; // hard failures (exceptions, missing data)
}

// ---------------------------------------------------------------------------
// Dimension scorers
// ---------------------------------------------------------------------------

/** Game setup: table_size, dealer_seat, blinds, hero position */
function scoreSetup(actual: OHHData, expected: OHHData): DimensionScore {
  const issues: string[] = [];
  let hits = 0;
  const checks = 5;

  if (actual.table_size === expected.table_size) hits++;
  else issues.push(`table_size: got ${actual.table_size}, want ${expected.table_size}`);

  if (actual.dealer_seat === expected.dealer_seat) hits++;
  else issues.push(`dealer_seat: got ${actual.dealer_seat}, want ${expected.dealer_seat}`);

  if (actual.small_blind_amount === expected.small_blind_amount) hits++;
  else issues.push(`sb: got ${actual.small_blind_amount}, want ${expected.small_blind_amount}`);

  if (actual.big_blind_amount === expected.big_blind_amount) hits++;
  else issues.push(`bb: got ${actual.big_blind_amount}, want ${expected.big_blind_amount}`);

  // Hero seat
  const actualHero = actual.players.find(p => p.id === actual.hero_player_id);
  const expectedHero = expected.players.find(p => p.id === expected.hero_player_id);
  if (actualHero && expectedHero && actualHero.seat === expectedHero.seat) hits++;
  else if (!actualHero) issues.push("hero player missing");
  else if (!expectedHero) issues.push("expected hero missing (test fixture error?)");
  else issues.push(`hero seat: got ${actualHero.seat}, want ${expectedHero.seat}`);

  return {
    dimension: "setup",
    score: hits / checks,
    maxScore: 1,
    details: issues.length ? issues.join("; ") : "perfect",
  };
}

/** Player population: correct count, names optional, stacks */
function scorePlayers(actual: OHHData, expected: OHHData): DimensionScore {
  const issues: string[] = [];
  let hits = 0;
  let checks = 0;

  // Count
  checks++;
  if (actual.players.length === expected.players.length) hits++;
  else issues.push(`player count: got ${actual.players.length}, want ${expected.players.length}`);

  // Per-seat matching
  for (const ep of expected.players) {
    checks++;
    const ap = actual.players.find(p => p.seat === ep.seat);
    if (!ap) {
      issues.push(`missing player at seat ${ep.seat}`);
      continue;
    }
    hits++; // seat exists

    // Cards (if expected)
    if (ep.cards && ep.cards.length > 0) {
      checks++;
      const actualCards = (ap.cards || []).slice().sort();
      const expectedCards = ep.cards.slice().sort();
      if (JSON.stringify(actualCards) === JSON.stringify(expectedCards)) {
        hits++;
      } else {
        issues.push(`seat ${ep.seat} cards: got [${ap.cards}], want [${ep.cards}]`);
      }
    }
  }

  return {
    dimension: "players",
    score: checks > 0 ? hits / checks : 1,
    maxScore: 1,
    details: issues.length ? issues.join("; ") : "perfect",
  };
}

/** Card notation: all cards use correct Rank+suit format */
function scoreCardNotation(actual: OHHData): DimensionScore {
  const cardRegex = /^[AKQJT98765432][shdc]$/;
  const issues: string[] = [];
  let total = 0;
  let valid = 0;

  // Player cards
  for (const p of actual.players) {
    if (p.cards) {
      for (const c of p.cards) {
        total++;
        if (cardRegex.test(c)) valid++;
        else issues.push(`player ${p.id} card "${c}" invalid`);
      }
    }
  }

  // Board cards
  for (const r of actual.rounds) {
    if (r.cards) {
      for (const c of r.cards) {
        total++;
        if (cardRegex.test(c)) valid++;
        else issues.push(`round ${r.id} card "${c}" invalid`);
      }
    }
  }

  return {
    dimension: "card_notation",
    score: total > 0 ? valid / total : 1,
    maxScore: 1,
    details: issues.length ? issues.join("; ") : total === 0 ? "no cards to check" : "perfect",
  };
}

/** Action sequence: per-round action matching */
function scoreActions(actual: OHHData, expected: OHHData): DimensionScore {
  const issues: string[] = [];
  let totalActions = 0;
  let matchedActions = 0;

  const maxRounds = Math.max(actual.rounds.length, expected.rounds.length);

  for (let r = 0; r < maxRounds; r++) {
    const ar = actual.rounds[r];
    const er = expected.rounds[r];

    if (!er) {
      issues.push(`extra round ${r} (${ar?.street}) in actual`);
      continue;
    }
    if (!ar) {
      totalActions += er.actions.length;
      issues.push(`missing round ${r} (${er.street})`);
      continue;
    }

    // Street name
    if (ar.street !== er.street) {
      issues.push(`round ${r} street: got ${ar.street}, want ${er.street}`);
    }

    // Board cards for this round
    if (er.cards && er.cards.length > 0) {
      const actualRanks = (ar.cards || []).map(c => c[0]).sort();
      const expectedRanks = er.cards.map(c => c[0]).sort();
      if (JSON.stringify(actualRanks) !== JSON.stringify(expectedRanks)) {
        issues.push(`round ${r} board ranks: got [${actualRanks}], want [${expectedRanks}]`);
      }
    }

    // Action-by-action
    const maxActions = Math.max(ar.actions.length, er.actions.length);
    for (let a = 0; a < maxActions; a++) {
      totalActions++;
      const aa = ar.actions[a];
      const ea = er.actions[a];

      if (!ea) {
        issues.push(`round ${r} extra action ${a}: ${aa?.action} by player ${aa?.player_id}`);
        continue;
      }
      if (!aa) {
        issues.push(`round ${r} missing action ${a}: ${ea.action} by player ${ea.player_id}`);
        continue;
      }

      let actionMatch = true;

      if (aa.player_id !== ea.player_id) {
        issues.push(`r${r}a${a} player: got ${aa.player_id}, want ${ea.player_id}`);
        actionMatch = false;
      }
      if (aa.action !== ea.action) {
        issues.push(`r${r}a${a} action: got ${aa.action}, want ${ea.action}`);
        actionMatch = false;
      }
      if (ea.amount !== undefined && aa.amount !== ea.amount) {
        issues.push(`r${r}a${a} amount: got ${aa.amount}, want ${ea.amount}`);
        actionMatch = false;
      }
      if (ea.is_allin && !aa.is_allin) {
        issues.push(`r${r}a${a} is_allin: got ${aa.is_allin}, want true`);
        actionMatch = false;
      }

      if (actionMatch) matchedActions++;
    }
  }

  return {
    dimension: "actions",
    score: totalActions > 0 ? matchedActions / totalActions : 1,
    maxScore: 1,
    details: issues.length ? issues.join("; ") : "perfect",
  };
}

/** State invariants: no duplicate cards, legal action sequences, pot math */
function scoreInvariants(actual: OHHData): DimensionScore {
  const issues: string[] = [];
  let checks = 0;
  let passes = 0;

  // 1. No duplicate cards across players + final board
  //    (Board cards are cumulative per round, so only check the last round's cards)
  checks++;
  const allCards: string[] = [];
  for (const p of actual.players) {
    if (p.cards) allCards.push(...p.cards);
  }
  const roundsWithCards = actual.rounds.filter(r => r.cards && r.cards.length > 0);
  if (roundsWithCards.length > 0) {
    allCards.push(...roundsWithCards[roundsWithCards.length - 1].cards!);
  }
  const uniqueCards = new Set(allCards);
  if (uniqueCards.size === allCards.length) {
    passes++;
  } else {
    const dupes = allCards.filter((c, i) => allCards.indexOf(c) !== i);
    issues.push(`duplicate cards: [${dupes}]`);
  }

  // 2. Action numbers sequential within each round
  for (const r of actual.rounds) {
    checks++;
    let sequential = true;
    for (let i = 0; i < r.actions.length; i++) {
      if (r.actions[i].action_number !== i + 1) {
        sequential = false;
        break;
      }
    }
    if (sequential) passes++;
    else issues.push(`round ${r.id} action_numbers not sequential`);
  }

  // 3. All player_ids in actions reference existing players
  checks++;
  const playerIds = new Set(actual.players.map(p => p.id));
  let allRefsValid = true;
  for (const r of actual.rounds) {
    for (const a of r.actions) {
      if (!playerIds.has(a.player_id)) {
        issues.push(`action references unknown player_id ${a.player_id}`);
        allRefsValid = false;
      }
    }
  }
  if (allRefsValid) passes++;

  // 4. No player folds twice
  checks++;
  const foldedPlayers = new Set<number>();
  let doubleFold = false;
  for (const r of actual.rounds) {
    for (const a of r.actions) {
      if (a.action === "Fold") {
        if (foldedPlayers.has(a.player_id)) {
          issues.push(`player ${a.player_id} folds twice`);
          doubleFold = true;
        }
        foldedPlayers.add(a.player_id);
      }
    }
  }
  if (!doubleFold) passes++;

  // 5. Folded player doesn't act again
  checks++;
  const foldedBefore = new Set<number>();
  let actAfterFold = false;
  for (const r of actual.rounds) {
    for (const a of r.actions) {
      if (a.action === "Fold") {
        foldedBefore.add(a.player_id);
      } else if (foldedBefore.has(a.player_id) && a.action !== "Dealt Card") {
        issues.push(`player ${a.player_id} acts after folding: ${a.action}`);
        actAfterFold = true;
      }
    }
  }
  if (!actAfterFold) passes++;

  return {
    dimension: "invariants",
    score: checks > 0 ? passes / checks : 1,
    maxScore: 1,
    details: issues.length ? issues.join("; ") : "perfect",
  };
}

// ---------------------------------------------------------------------------
// Main scorer
// ---------------------------------------------------------------------------

const DIMENSION_WEIGHTS: Record<string, number> = {
  setup: 0.15,
  players: 0.15,
  card_notation: 0.10,
  actions: 0.40,
  invariants: 0.20,
};

export function scoreEval(caseId: string, actual: OHHData, expected: OHHData): EvalResult {
  const errors: string[] = [];
  const dimensions: DimensionScore[] = [];

  try {
    dimensions.push(scoreSetup(actual, expected));
    dimensions.push(scorePlayers(actual, expected));
    dimensions.push(scoreCardNotation(actual));
    dimensions.push(scoreActions(actual, expected));
    dimensions.push(scoreInvariants(actual));
  } catch (e: any) {
    errors.push(e.message);
  }

  const overall = dimensions.reduce((sum, d) => {
    const w = DIMENSION_WEIGHTS[d.dimension] ?? 0;
    return sum + d.score * w;
  }, 0);

  return { caseId, overall, dimensions, errors };
}

export function formatEvalResult(r: EvalResult): string {
  const lines: string[] = [
    `\n=== ${r.caseId} === overall: ${(r.overall * 100).toFixed(1)}%`,
  ];
  for (const d of r.dimensions) {
    const pct = (d.score * 100).toFixed(1);
    const status = d.score === 1 ? "✓" : d.score === 0 ? "✗" : "~";
    lines.push(`  ${status} ${d.dimension}: ${pct}%${d.details !== "perfect" ? " — " + d.details : ""}`);
  }
  if (r.errors.length) {
    lines.push(`  ERRORS: ${r.errors.join("; ")}`);
  }
  return lines.join("\n");
}
