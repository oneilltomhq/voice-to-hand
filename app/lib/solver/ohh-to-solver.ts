/**
 * Transform an OHH hand history into inputs for postflop-solver.
 *
 * The solver needs:
 *   1. Two ranges (OOP player, IP player) as range strings
 *   2. Board cards (flop, turn, river)
 *   3. Starting pot and effective stack at the solve point
 *   4. Which street to start solving from
 *   5. Bet size tree configuration
 *
 * Limitations of this PoC:
 *   - Only supports hands that are heads-up by the flop
 *   - Only supports single raised pots (no 3bet/4bet yet beyond the known scenarios)
 *   - Uses archetype-based range estimation
 */

import { OHHData, Action, Round } from '../OpenHandHistory';
import { PlayerArchetype, Position, lookupRange } from './ranges';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SolverInput {
  oopRange: string;
  ipRange: string;
  board: string[];          // e.g. ["Td", "9d", "6h"] or ["Td", "9d", "6h", "Qc"]
  startingPot: number;      // pot size at the start of the solve street
  effectiveStack: number;   // smaller of the two remaining stacks
  solveStreet: 'Flop' | 'Turn' | 'River';
  // The actual actions that happened (for reference / bet sizing)
  actualActions: Action[];
}

export interface PlayerInfo {
  id: number;
  position: Position;
  archetype: PlayerArchetype;
  isOOP: boolean;  // true = out of position postflop
}

export type TransformResult =
  | { ok: true; input: SolverInput; players: [PlayerInfo, PlayerInfo] }
  | { ok: false; error: string };;

// ---------------------------------------------------------------------------
// Position mapping
// ---------------------------------------------------------------------------

/** Map seat number to position name given table size and dealer seat. */
export function seatToPosition(seat: number, dealerSeat: number, tableSize: number): Position {
  // Positions clockwise from dealer: BTN, SB, BB, UTG, MP, CO (for 6-max)
  // For HU: BTN/SB, BB
  const offset = ((seat - dealerSeat) + tableSize) % tableSize;

  if (tableSize === 2) {
    // Heads-up: seat 0 offset = BTN/SB, seat 1 offset = BB
    return offset === 0 ? 'BTN' : 'BB';
  }

  if (tableSize <= 4) {
    // Short-handed: BTN, SB, BB, UTG
    const positions: Position[] = ['BTN', 'SB', 'BB', 'UTG'];
    return positions[offset] ?? 'UTG';
  }

  if (tableSize <= 6) {
    // 6-max: BTN, SB, BB, UTG, MP, CO
    const positions: Position[] = ['BTN', 'SB', 'BB', 'UTG', 'MP', 'CO'];
    return positions[offset] ?? 'UTG';
  }

  // Full ring (7-10): BTN, SB, BB, UTG, UTG, MP, MP, CO, (CO)
  // Simplified: map to nearest 6-max equivalent
  const positions9: Position[] = ['BTN', 'SB', 'BB', 'UTG', 'UTG', 'MP', 'MP', 'CO', 'CO'];
  return positions9[offset] ?? 'UTG';
}

// ---------------------------------------------------------------------------
// Preflop analysis
// ---------------------------------------------------------------------------

interface PreflopResult {
  /** The two players still in the hand after preflop, with position/range info. */
  oopPlayer: { id: number; position: Position; range: string };
  ipPlayer: { id: number; position: Position; range: string };
  /** Total pot going to the flop. */
  potAtFlop: number;
  /** Each player's remaining stack going to the flop. */
  stacks: Map<number, number>;
  /** What kind of preflop action occurred */
  scenario: 'srp' | '3bet' | 'limp' | 'unsupported';
}

/**
 * Classify the preflop action and determine ranges + pot for the two
 * players who see the flop.
 */
export function analyzePreflopAction(
  ohh: OHHData,
  archetypes: Map<number, PlayerArchetype>,
): PreflopResult | { error: string } {
  const preflopRound = ohh.rounds.find(r => r.street === 'Preflop');
  if (!preflopRound) return { error: 'No preflop round found' };

  // Build position map
  const positionOf = new Map<number, Position>();
  for (const p of ohh.players) {
    positionOf.set(p.id, seatToPosition(p.seat, ohh.dealer_seat, ohh.table_size));
  }

  // Track stacks and who's still in
  const stacks = new Map<number, number>();
  for (const p of ohh.players) {
    stacks.set(p.id, p.starting_stack);
  }

  const committed = new Map<number, number>();
  for (const p of ohh.players) {
    committed.set(p.id, 0);
  }

  const folded = new Set<number>();
  let lastRaiser: number | null = null;
  let raiseCount = 0;
  let firstRaiserPosition: Position | null = null;

  for (const action of preflopRound.actions) {
    const pid = action.player_id;
    const amt = action.amount ?? 0;

    switch (action.action) {
      case 'Post SB':
      case 'Post BB':
        committed.set(pid, (committed.get(pid) ?? 0) + amt);
        stacks.set(pid, (stacks.get(pid) ?? 0) - amt);
        break;
      case 'Fold':
        folded.add(pid);
        break;
      case 'Call':
        committed.set(pid, (committed.get(pid) ?? 0) + amt);
        stacks.set(pid, (stacks.get(pid) ?? 0) - amt);
        break;
      case 'Raise':
        raiseCount++;
        lastRaiser = pid;
        if (raiseCount === 1) {
          firstRaiserPosition = positionOf.get(pid) ?? null;
        }
        committed.set(pid, (committed.get(pid) ?? 0) + amt);
        stacks.set(pid, (stacks.get(pid) ?? 0) - amt);
        break;
      case 'Bet':
        // Unusual preflop but handle it
        raiseCount++;
        lastRaiser = pid;
        committed.set(pid, (committed.get(pid) ?? 0) + amt);
        stacks.set(pid, (stacks.get(pid) ?? 0) - amt);
        break;
    }
  }

  // Who saw the flop?
  const activePlayers = ohh.players.filter(p => !folded.has(p.id));

  if (activePlayers.length < 2) {
    return { error: 'Hand ended preflop (fewer than 2 players remain)' };
  }

  if (activePlayers.length > 2) {
    return { error: `Multiway pot (${activePlayers.length} players) — solver requires heads-up` };
  }

  // Total pot
  let potAtFlop = 0;
  committed.forEach(v => potAtFlop += v);

  // Determine OOP vs IP
  // Postflop position: the player closer to the left of the dealer acts first (OOP).
  // In practice for common spots: BB is OOP vs BTN/CO/UTG, SB is OOP vs BTN, etc.
  const [p1, p2] = activePlayers;
  const pos1 = positionOf.get(p1.id)!;
  const pos2 = positionOf.get(p2.id)!;

  // Postflop order: SB, BB, UTG, MP, CO, BTN (SB acts first = most OOP)
  const POSTFLOP_ORDER: Position[] = ['SB', 'BB', 'UTG', 'MP', 'CO', 'BTN'];
  const idx1 = POSTFLOP_ORDER.indexOf(pos1);
  const idx2 = POSTFLOP_ORDER.indexOf(pos2);

  let oopId: number, ipId: number;
  if (idx1 < idx2) {
    oopId = p1.id;
    ipId = p2.id;
  } else {
    oopId = p2.id;
    ipId = p1.id;
  }

  const oopPos = positionOf.get(oopId)!;
  const ipPos = positionOf.get(ipId)!;
  const oopArchetype = archetypes.get(oopId) ?? 'unknown';
  const ipArchetype = archetypes.get(ipId) ?? 'unknown';

  // Determine scenario and assign ranges
  let scenario: 'srp' | '3bet' | 'limp' | 'unsupported' = 'unsupported';
  let oopRange: string | null = null;
  let ipRange: string | null = null;

  if (raiseCount === 1) {
    // Single raised pot
    scenario = 'srp';
    const raiserPos = positionOf.get(lastRaiser!)!;

    if (lastRaiser === ipId) {
      // IP was the raiser (e.g. BTN opens, BB calls)
      ipRange = lookupRange(ipArchetype, raiserPos, 'rfi');
      oopRange = lookupRange(oopArchetype, oopPos, 'defend_call', raiserPos);
    } else {
      // OOP was the raiser (e.g. UTG opens, BTN calls) — less common but valid
      oopRange = lookupRange(oopArchetype, oopPos, 'rfi');
      ipRange = lookupRange(ipArchetype, ipPos, 'defend_call', oopPos);
    }
  } else if (raiseCount === 2) {
    // 3-bet pot
    scenario = '3bet';
    // Find the original raiser and the 3-bettor
    // The original raiser called the 3-bet (otherwise they'd have folded or 4-bet)
    // For now, attempt range lookup for common 3-bet scenarios
    if (firstRaiserPosition) {
      const threeBettorId = lastRaiser!;
      const callerId = threeBettorId === oopId ? ipId : oopId;
      const threeBettorPos = positionOf.get(threeBettorId)!;
      const callerPos = positionOf.get(callerId)!;

      if (threeBettorId === oopId) {
        // OOP 3-bet, IP called (e.g. BB 3-bets, BTN calls)
        oopRange = lookupRange(oopArchetype, threeBettorPos, 'defend_3bet', callerPos);
        ipRange = lookupRange(ipArchetype, callerPos, 'call_3bet', threeBettorPos);
      } else {
        // IP 3-bet, OOP called (e.g. SB 3-bets vs BTN open... but SB is OOP to BTN? No, SB is OOP.)
        // Actually: if SB 3-bets BTN, SB is OOP. That's "SB 3-bet vs BTN".
        ipRange = lookupRange(ipArchetype, threeBettorPos, 'defend_3bet', callerPos);
        oopRange = lookupRange(oopArchetype, callerPos, 'call_3bet', threeBettorPos);
      }
    }
  } else if (raiseCount === 0) {
    scenario = 'limp';
    // Limped pot — use very wide ranges, approximate with RFI from position
    oopRange = lookupRange(oopArchetype, oopPos, 'rfi');
    ipRange = lookupRange(ipArchetype, ipPos, 'rfi');
  }

  if (!oopRange || !ipRange) {
    return {
      error: `Could not determine ranges for ${oopPos} vs ${ipPos} (scenario: ${scenario}, raises: ${raiseCount})`,
    };
  }

  return {
    oopPlayer: { id: oopId, position: oopPos, range: oopRange },
    ipPlayer: { id: ipId, position: ipPos, range: ipRange },
    potAtFlop,
    stacks,
    scenario,
  };
}

// ---------------------------------------------------------------------------
// Full transform
// ---------------------------------------------------------------------------

export interface TransformOptions {
  /** Which street to solve from. Defaults to the latest street in the hand. */
  solveStreet?: 'Flop' | 'Turn' | 'River';
  /** Player archetypes keyed by player ID. Missing = 'unknown'. */
  archetypes?: Map<number, PlayerArchetype>;
}

/**
 * Transform an OHH hand into solver input.
 *
 * Returns the two ranges, board, pot, effective stack, and solve street,
 * or an error string if the hand can't be solved.
 */
export function ohhToSolverInput(
  ohh: OHHData,
  options: TransformOptions = {},
): TransformResult {
  const archetypes = options.archetypes ?? new Map();

  // 1. Analyze preflop
  const preflop = analyzePreflopAction(ohh, archetypes);
  if ('error' in preflop) {
    return { ok: false, error: preflop.error };
  }

  // 2. Determine which street to solve
  const streets = ohh.rounds.map(r => r.street);
  const postflopStreets = streets.filter(s => s !== 'Preflop' && s !== 'Showdown') as ('Flop' | 'Turn' | 'River')[];

  if (postflopStreets.length === 0) {
    return { ok: false, error: 'Hand has no postflop action' };
  }

  const solveStreet = options.solveStreet ?? postflopStreets[postflopStreets.length - 1];

  // 3. Extract board cards
  const flopRound = ohh.rounds.find(r => r.street === 'Flop');
  const turnRound = ohh.rounds.find(r => r.street === 'Turn');
  const riverRound = ohh.rounds.find(r => r.street === 'River');

  if (!flopRound?.cards || flopRound.cards.length < 3) {
    return { ok: false, error: 'Missing flop cards' };
  }

  let board: string[];
  switch (solveStreet) {
    case 'Flop':
      board = flopRound.cards.slice(0, 3);
      break;
    case 'Turn': {
      // Turn cards might be appended to flop cards or in a separate round
      const turnCard = turnRound?.cards
        ? turnRound.cards.find(c => !flopRound.cards!.includes(c)) ?? turnRound.cards[turnRound.cards.length - 1]
        : null;
      if (!turnCard) return { ok: false, error: 'Missing turn card' };
      board = [...flopRound.cards.slice(0, 3), turnCard];
      break;
    }
    case 'River': {
      const turnCard2 = turnRound?.cards
        ? turnRound.cards.find(c => !flopRound.cards!.includes(c)) ?? turnRound.cards[turnRound.cards.length - 1]
        : null;
      const riverCard = riverRound?.cards
        ? riverRound.cards.find(c => !flopRound.cards!.includes(c) && c !== turnCard2) ?? riverRound.cards[riverRound.cards.length - 1]
        : null;
      if (!turnCard2 || !riverCard) return { ok: false, error: 'Missing turn or river card' };
      board = [...flopRound.cards.slice(0, 3), turnCard2, riverCard];
      break;
    }
  }

  // 4. Calculate pot and stacks at the solve street
  //    Walk through all actions up to (but not including) the solve street
  const { stacks, potAtFlop, oopPlayer, ipPlayer } = preflop;
  let pot = potAtFlop;
  const playerStacks = new Map(stacks);

  // Process postflop streets up to the solve street
  const streetOrder = ['Flop', 'Turn', 'River'] as const;
  const solveIdx = streetOrder.indexOf(solveStreet);

  for (let i = 0; i < solveIdx; i++) {
    const streetName = streetOrder[i];
    const round = ohh.rounds.find(r => r.street === streetName);
    if (!round) break;

    for (const action of round.actions) {
      const amt = action.amount ?? 0;
      if (amt > 0 && ['Bet', 'Raise', 'Call'].includes(action.action)) {
        playerStacks.set(action.player_id, (playerStacks.get(action.player_id) ?? 0) - amt);
        pot += amt;
      }
    }
  }

  const oopStack = playerStacks.get(oopPlayer.id) ?? 0;
  const ipStack = playerStacks.get(ipPlayer.id) ?? 0;
  const effectiveStack = Math.min(oopStack, ipStack);

  // 5. Collect actual actions for the solve street (useful for bet sizing)
  const solveRound = ohh.rounds.find(r => r.street === solveStreet);
  const actualActions = solveRound?.actions ?? [];

  // 6. Build result
  return {
    ok: true,
    input: {
      oopRange: oopPlayer.range,
      ipRange: ipPlayer.range,
      board,
      startingPot: pot,
      effectiveStack,
      solveStreet,
      actualActions,
    },
    players: [
      { id: oopPlayer.id, position: oopPlayer.position, archetype: archetypes.get(oopPlayer.id) ?? 'unknown', isOOP: true },
      { id: ipPlayer.id, position: ipPlayer.position, archetype: archetypes.get(ipPlayer.id) ?? 'unknown', isOOP: false },
    ],
  };
}
