/**
 * Preflop range lookup by player archetype, position, and scenario.
 *
 * Ranges are in standard poker notation:
 *   "22+" = all pairs 22 through AA
 *   "A2s+" = all suited aces
 *   "ATo+" = AT offsuit and above
 *   "K9s-KJs" = K9s, KTs, KJs
 */

export type PlayerArchetype = 'tag' | 'fish' | 'nit' | 'lag' | 'unknown';

export type Position = 'UTG' | 'MP' | 'CO' | 'BTN' | 'SB' | 'BB';

/** Game context determines the default archetype for unknown players. */
export type GameContext =
  | 'live_low_stakes'   // e.g. London £1/2 — default: fish
  | 'live_mid_stakes'   // e.g. £2/5 — default: unknown
  | 'live_high_stakes'  // e.g. £5/10+ — default: tag
  | 'online_micros'     // NL2-NL25 — default: fish
  | 'online_low'        // NL50-NL100 — default: unknown
  | 'online_mid_high'   // NL200+ — default: tag
  | 'tournament';       // default: tag

const CONTEXT_DEFAULTS: Record<GameContext, PlayerArchetype> = {
  live_low_stakes: 'fish',
  live_mid_stakes: 'unknown',
  live_high_stakes: 'tag',
  online_micros: 'fish',
  online_low: 'unknown',
  online_mid_high: 'tag',
  tournament: 'tag',
};

export function getDefaultArchetype(context: GameContext): PlayerArchetype {
  return CONTEXT_DEFAULTS[context];
}

// ---------------------------------------------------------------------------
// Range data
// ---------------------------------------------------------------------------

interface ArchetypeRanges {
  rfi: Record<string, string>;          // keyed by position: "UTG", "MP", etc.
  defend_call: Record<string, string>;  // keyed by "BB_vs_UTG", "BB_vs_CO", etc.
  defend_3bet: Record<string, string>;  // keyed by "BB_vs_UTG", "SB_vs_BTN", etc.
  call_3bet: Record<string, string>;    // keyed by "BTN_vs_BB", "CO_vs_BB"
}

const TAG: ArchetypeRanges = {
  rfi: {
    UTG: '22+,A2s+,AJo+,K9s+,KQo,Q9s+,JTs,T9s',
    MP:  '22+,A2s+,A9o+,K8s+,KJo+,Q9s+,QJo,J9s+,T8s+,98s',
    CO:  '22+,A2s+,A7o+,K5s+,KTo+,Q7s+,QTo+,J8s+,JTo,T7s+,T9o,97s+,87s,76s,65s',
    BTN: '22+,A2s+,A2o+,K2s+,K7o+,Q2s+,Q8o+,J5s+,J9o+,T6s+,T8o+,96s+,98o,85s+,87o,75s+,76o,64s+,65o,54s',
    SB:  '22+,A2s+,A5o+,K4s+,K9o+,Q6s+,QTo+,J7s+,JTo,T7s+,T9o,96s+,98o,86s+,75s+,76o,65s,54s',
  },
  defend_call: {
    BB_vs_UTG: '22-99,A2s-A9s,A9o-AJo,K5s-KJs,KJo,Q8s-QJs,J8s-JTs,T8s-T9s,98s,87s,76s,65s,54s',
    BB_vs_CO:  '22-JJ,A2s-AJs,A3o-AJo,K2s-KJs,K9o-KJo,Q5s-QJs,Q9o-QJo,J7s-JTs,J9o-JTo,T7s-T9s,T9o,96s+,98o,85s+,87o,75s+,76o,64s+,54s',
    BB_vs_BTN: '22-TT,A2s-ATs,A2o-AJo,K2s-KJs,K5o-KJo,Q2s-QJs,Q7o-QJo,J4s-JTs,J8o-JTo,T6s-T9s,T8o-T9o,95s+,97o+,85s+,87o,74s+,76o,64s+,54s,43s',
  },
  defend_3bet: {
    BB_vs_UTG: 'TT+,ATs+,AQo+,KQs',
    BB_vs_CO:  'QQ+,AJs+,AQo+,KQs,A5s',
    BB_vs_BTN: 'JJ+,ATs+,AJo+,KTs+,KQo,QJs,A2s-A5s,K5s-K7s,Q8s-QTs,J9s,T8s+,97s+,87s,76s',
    SB_vs_BTN: 'TT+,A9s+,AJo+,KTs+,KQo,QJs,A2s-A5s,K6s-K9s,Q9s-QTs,J9s,T9s,98s',
  },
  call_3bet: {
    BTN_vs_BB: '66-JJ,A9s-AJs,ATo-AQo,K9s-KJs,KJo+,Q9s-QJs,QJo,J9s-JTs,T8s+,98s,87s,76s,65s',
    CO_vs_BB:  '66-JJ,A8s-AJs,ATo-AQo,K9s-KJs,KJo+,Q9s-QJs,QJo,J9s-JTs,JTo,T9s,98s,87s',
  },
};

const FISH: ArchetypeRanges = {
  rfi: {
    UTG: '22+,A2s+,A8o+,K7s+,KTo+,Q8s+,QTo+,J8s+,JTo,T8s+,T9o,98s,87s,76s,65s,54s',
    MP:  '22+,A2s+,A5o+,K4s+,K9o+,Q6s+,Q9o+,J6s+,J9o+,T7s+,T9o,96s+,98o,86s+,87o,75s+,76o,65s,54s',
    CO:  '22+,A2s+,A2o+,K2s+,K5o+,Q2s+,Q7o+,J3s+,J8o+,T5s+,T8o+,95s+,97o+,84s+,86o+,74s+,76o,63s+,65o,53s+,54o,43s',
    BTN: '22+,A2s+,A2o+,K2s+,K2o+,Q2s+,Q2o+,J2s+,J5o+,T2s+,T6o+,92s+,95o+,82s+,85o+,72s+,75o+,62s+,64o+,52s+,54o,42s+,43o,32s',
    SB:  '22+,A2s+,A2o+,K2s+,K4o+,Q2s+,Q5o+,J3s+,J7o+,T5s+,T7o+,95s+,97o,84s+,86o,74s+,75o,63s+,64o,53s+,43s',
  },
  defend_call: {
    BB_vs_UTG: '22+,A2s+,A2o+,K2s+,K5o+,Q4s+,Q8o+,J6s+,J9o+,T6s+,T9o,95s+,98o,85s+,87o,74s+,76o,64s+,65o,53s+,54o,43s',
    BB_vs_CO:  '22+,A2s+,A2o+,K2s+,K4o+,Q2s+,Q6o+,J4s+,J8o+,T5s+,T8o+,94s+,97o,84s+,86o+,73s+,75o+,63s+,64o+,53s+,54o,42s+,43o,32s',
    BB_vs_BTN: '22+,A2s+,A2o+,K2s+,K2o+,Q2s+,Q3o+,J2s+,J6o+,T3s+,T6o+,93s+,96o+,82s+,85o+,72s+,74o+,62s+,64o+,52s+,53o+,42s+,32s',
  },
  defend_3bet: {
    BB_vs_UTG: 'QQ+,AKs,AKo',
    BB_vs_CO:  'JJ+,AQs+,AKo',
    BB_vs_BTN: 'TT+,AJs+,AQo+',
    SB_vs_BTN: 'JJ+,AQs+,AKo',
  },
  call_3bet: {
    BTN_vs_BB: '22+,A2s+,A5o+,K6s+,K9o+,Q8s+,QTo+,J8s+,JTo,T8s+,T9o,97s+,98o,87s,76s,65s,54s',
    CO_vs_BB:  '22+,A2s+,A7o+,K7s+,K9o+,Q8s+,QTo+,J8s+,JTo,T8s+,T9o,97s+,98o,87s,76s,65s',
  },
};

const NIT: ArchetypeRanges = {
  rfi: {
    UTG: '77+,ATs+,AQo+,KQs',
    MP:  '55+,A9s+,AJo+,KJs+,KQo,QJs',
    CO:  '44+,A7s+,ATo+,KTs+,KJo+,QTs+,QJo,JTs',
    BTN: '22+,A5s+,A9o+,K9s+,KTo+,Q9s+,QJo,J9s+,JTo,T9s',
    SB:  '33+,A7s+,ATo+,K9s+,KJo+,Q9s+,QJo,J9s+,T9s',
  },
  defend_call: {
    BB_vs_UTG: '66-99,A5s-A9s,AJo,K9s-KJs,KJo,Q9s-QJs,J9s-JTs,T9s,98s',
    BB_vs_CO:  '44-JJ,A3s-AJs,A9o-AJo,K7s-KJs,K9o-KJo,Q8s-QJs,Q9o-QJo,J8s-JTs,J9o-JTo,T8s-T9s,T9o,98s,87s,76s',
    BB_vs_BTN: '33-TT,A2s-AJs,A7o-AJo,K5s-KJs,K9o-KJo,Q7s-QJs,Q9o-QJo,J7s-JTs,J9o-JTo,T7s-T9s,T9o,97s+,98o,86s+,87o,76s,65s',
  },
  defend_3bet: {
    BB_vs_UTG: 'TT+,AJs+,AQo+',
    BB_vs_CO:  'QQ+,ATs+,AQo+,KQs',
    BB_vs_BTN: 'JJ+,ATs+,AJo+,KQs,A5s',
    SB_vs_BTN: 'JJ+,AJs+,AQo+,KQs,A5s',
  },
  call_3bet: {
    BTN_vs_BB: '88-JJ,AJs,AQo,KQs,QJs,JTs',
    CO_vs_BB:  '88-JJ,ATs-AJs,AQo,KQs,QJs,JTs',
  },
};

const LAG: ArchetypeRanges = {
  rfi: {
    UTG: '22+,A2s+,ATo+,K9s+,KQo,Q9s+,QJo,J9s+,T9s,98s',
    MP:  '22+,A2s+,A7o+,K6s+,KTo+,Q7s+,QTo+,J7s+,J9o+,T7s+,T9o,97s+,87s,76s,65s',
    CO:  '22+,A2s+,A2o+,K2s+,K7o+,Q2s+,Q8o+,J4s+,J8o+,T6s+,T8o+,95s+,97o+,85s+,87o,74s+,76o,64s+,65o,54s,43s',
    BTN: '22+,A2s+,A2o+,K2s+,K2o+,Q2s+,Q2o+,J2s+,J4o+,T2s+,T6o+,92s+,94o+,82s+,84o+,72s+,74o+,62s+,64o+,52s+,53o+,42s+,43o,32s',
    SB:  '22+,A2s+,A2o+,K2s+,K3o+,Q2s+,Q4o+,J2s+,J6o+,T4s+,T7o+,94s+,96o+,84s+,86o,73s+,75o+,63s+,64o,52s+,53o+,42s+,32s',
  },
  defend_call: {
    BB_vs_UTG: '22-99,A2s-A9s,A8o-AJo,K6s-KJs,KTo-KJo,Q7s-QJs,QTo-QJo,J8s-JTs,J9o-JTo,T8s-T9s,98s,87s,76s,65s',
    BB_vs_CO:  '22-JJ,A2s-AJs,A4o-AJo,K3s-KJs,K8o-KJo,Q5s-QJs,Q8o-QJo,J6s-JTs,J8o-JTo,T6s-T9s,T8o-T9o,95s+,97o+,85s+,87o,75s+,76o,64s+,65o,54s',
    BB_vs_BTN: '22-TT,A2s-ATs,A2o-ATo,K2s-KJs,K5o-KJo,Q2s-QJs,Q6o-QJo,J5s-JTs,J7o-JTo,T5s-T9s,T7o-T9o,94s+,96o+,84s+,86o+,74s+,75o+,63s+,64o+,53s+,54o,43s',
  },
  defend_3bet: {
    BB_vs_UTG: 'TT+,ATs+,AQo+,KQs,A2s-A5s,K9s,Q9s,J9s,T9s',
    BB_vs_CO:  'QQ+,AJs+,AQo+,KTs+,KQo,QJs,A2s-A5s,K5s-K9s,Q8s-QTs,J9s,T8s+,97s+,87s,76s',
    BB_vs_BTN: 'JJ+,A9s+,AJo+,KTs+,KQo,QTs+,QJo,JTs,A2s-A8s,K4s-K9s,Q5s-Q9s,J7s-J9s,T7s-T9s,97s+,86s+,76s,65s',
    SB_vs_BTN: 'TT+,A8s+,AJo+,KTs+,KQo,QTs+,QJo,JTs,A2s-A7s,K5s-K9s,Q7s-Q9s,J8s-J9s,T8s-T9s,98s,87s,76s',
  },
  call_3bet: {
    BTN_vs_BB: '55+,A2s+,A8o+,K7s+,KTo+,Q8s+,QTo+,J8s+,JTo,T8s+,T9o,97s+,98o,87s,76s,65s,54s',
    CO_vs_BB:  '55+,A5s+,A9o+,K8s+,KJo+,Q9s+,QJo,J9s+,JTo,T8s+,T9o,98s,87s,76s,65s',
  },
};

const UNKNOWN: ArchetypeRanges = {
  rfi: {
    UTG: '22+,A2s+,ATo+,K8s+,KQo,Q9s+,QJo,J9s+,JTo,T8s+,T9o,98s,87s,76s',
    MP:  '22+,A2s+,A7o+,K6s+,KTo+,Q7s+,QTo+,J7s+,J9o+,T7s+,T9o,96s+,98o,86s+,87o,75s+,76o,65s,54s',
    CO:  '22+,A2s+,A4o+,K3s+,K8o+,Q4s+,Q8o+,J5s+,J8o+,T6s+,T8o+,95s+,97o+,85s+,87o,74s+,76o,64s+,65o,54s,43s',
    BTN: '22+,A2s+,A2o+,K2s+,K4o+,Q2s+,Q5o+,J2s+,J7o+,T3s+,T7o+,93s+,96o+,83s+,85o+,72s+,75o+,62s+,64o+,52s+,54o,42s+,43o,32s',
    SB:  '22+,A2s+,A3o+,K3s+,K7o+,Q4s+,Q8o+,J5s+,J8o+,T6s+,T8o+,95s+,97o,85s+,86o,74s+,75o+,64s+,65o,53s+,54o,43s',
  },
  defend_call: {
    BB_vs_UTG: '22-TT,A2s+,A6o+,K4s+,K9o+,Q6s+,Q9o+,J7s+,J9o+,T7s+,T9o,96s+,98o,85s+,87o,75s+,76o,64s+,65o,54s',
    BB_vs_CO:  '22-JJ,A2s+,A4o+,K2s+,K7o+,Q4s+,Q8o+,J5s+,J8o+,T6s+,T8o+,95s+,97o+,84s+,86o+,74s+,75o+,63s+,64o+,53s+,54o,43s',
    BB_vs_BTN: '22-TT,A2s+,A2o+,K2s+,K4o+,Q2s+,Q5o+,J3s+,J7o+,T4s+,T7o+,94s+,96o+,83s+,85o+,73s+,75o+,62s+,64o+,52s+,53o+,42s+,43o,32s',
  },
  defend_3bet: {
    BB_vs_UTG: 'JJ+,AQs+,AKo',
    BB_vs_CO:  'QQ+,AJs+,AQo+,KQs',
    BB_vs_BTN: 'JJ+,ATs+,AJo+,KQs,A5s',
    SB_vs_BTN: 'TT+,ATs+,AQo+,KQs,A4s-A5s',
  },
  call_3bet: {
    BTN_vs_BB: '66-JJ,A7s+,A9o+,K9s+,KJo+,Q9s+,QJo,J9s+,JTo,T8s+,T9o,98s,87s,76s,65s',
    CO_vs_BB:  '66-JJ,A7s+,ATo+,K9s+,KJo+,Q9s+,QJo,J9s+,JTo,T8s+,T9o,98s,87s,76s',
  },
};

const RANGES: Record<PlayerArchetype, ArchetypeRanges> = {
  tag: TAG,
  fish: FISH,
  nit: NIT,
  lag: LAG,
  unknown: UNKNOWN,
};

// ---------------------------------------------------------------------------
// Lookup
// ---------------------------------------------------------------------------

/**
 * Look up a preflop range string for a given archetype + scenario.
 *
 * @param archetype  - Player type
 * @param position   - The player's position (e.g. BTN for RFI, BB for defend)
 * @param scenario   - What they did: rfi, defend_call, defend_3bet, call_3bet
 * @param vsPosition - Opponent's position (required for defend/call scenarios)
 * @returns Range string or null if the scenario isn't in our table
 */
export function lookupRange(
  archetype: PlayerArchetype,
  position: Position,
  scenario: 'rfi',
): string | null;
export function lookupRange(
  archetype: PlayerArchetype,
  position: Position,
  scenario: 'defend_call' | 'defend_3bet' | 'call_3bet',
  vsPosition: Position,
): string | null;
export function lookupRange(
  archetype: PlayerArchetype,
  position: Position,
  scenario: string,
  vsPosition?: Position,
): string | null {
  const table = RANGES[archetype];
  if (!table) return null;

  if (scenario === 'rfi') {
    return table.rfi[position] ?? null;
  }

  if (!vsPosition) return null;
  const key = `${position}_vs_${vsPosition}`;

  switch (scenario) {
    case 'defend_call':
      return table.defend_call[key] ?? null;
    case 'defend_3bet':
      return table.defend_3bet[key] ?? null;
    case 'call_3bet':
      return table.call_3bet[key] ?? null;
    default:
      return null;
  }
}
