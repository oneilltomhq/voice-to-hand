import { z } from "zod";
import { OHHData, Round, Action, Player } from "./OpenHandHistory";

// --- Intent Schema ---

export const IntentSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("PLAYER_ACTION"),
    seat: z.number().describe("The seat number of the player performing the action (1-indexed)"),
    action: z.enum(["FOLD", "CHECK", "CALL", "BET", "RAISE", "POST_SB", "POST_BB"]),
    amount: z.number().optional().describe("The TOTAL amount committed to the pot for this street (e.g. raise to 50 = 50). Required for Bet/Raise."),
  }),
  z.object({
    type: z.literal("NEW_STREET"),
    street: z.enum(["FLOP", "TURN", "RIVER", "SHOWDOWN"]),
    cards: z.array(z.string()).describe("The full list of board cards for this new street (including previous ones) OR just the new ones. Ideally all."),
  }),
  z.object({
    type: z.literal("DEAL_CARDS"),
    seat: z.number(),
    cards: z.array(z.string()),
  }),
  z.object({
    type: z.literal("GAME_CONFIG"),
    table_size: z.number().optional(),
    small_blind: z.number().optional(),
    big_blind: z.number().optional(),
    hero_seat: z.number().optional(),
  })
]);

export type PokerIntent = z.infer<typeof IntentSchema>;

// --- State Machine ---

export function applyIntent(gameState: OHHData, intent: PokerIntent): OHHData {
  // Deep copy to avoid mutation
  const nextState: OHHData = JSON.parse(JSON.stringify(gameState));

  // Ensure rounds array exists
  if (!nextState.rounds) nextState.rounds = [];
  
  // Ensure players array exists
  if (!nextState.players) nextState.players = [];

  switch (intent.type) {
    case "GAME_CONFIG":
      return handleGameConfig(nextState, intent);
    case "PLAYER_ACTION":
      return handlePlayerAction(nextState, intent);
    case "NEW_STREET":
      return handleNewStreet(nextState, intent);
    case "DEAL_CARDS":
      return handleDealCards(nextState, intent);
    default:
      return nextState;
  }
}

function handleGameConfig(state: OHHData, intent: Extract<PokerIntent, { type: "GAME_CONFIG" }>): OHHData {
  if (intent.table_size) state.table_size = intent.table_size;
  if (intent.small_blind) state.small_blind_amount = intent.small_blind;
  if (intent.big_blind) state.big_blind_amount = intent.big_blind;
  
  // Update dealer seat logic if needed? 
  // For now, just setting properties.
  
  // Ensure players exist for all seats up to table size
    if (state.table_size) {
    for (let i = 1; i <= state.table_size; i++) {
        if (!state.players.find(p => p.seat === i)) {
            state.players.push({
                id: i,
                name: `P${i}`,
                seat: i,
                starting_stack: (state.big_blind_amount || 2) * 100 // Default stack, fallback to 2 if BB unknown
            });
        }
    }
    // Sort players by seat
    state.players.sort((a, b) => a.seat - b.seat);
  }

  return state;
}

function handleDealCards(state: OHHData, intent: Extract<PokerIntent, { type: "DEAL_CARDS" }>): OHHData {
  const player = state.players.find(p => p.seat === intent.seat);
  if (player) {
    player.cards = intent.cards;
  } else {
    // If player doesn't exist (e.g. implied by seat), create them?
    // Ideally GAME_CONFIG handled this, but let's be safe.
    state.players.push({
        id: intent.seat,
        name: `P${intent.seat}`,
        seat: intent.seat,
        starting_stack: (state.big_blind_amount || 2) * 100, // Fallback to 2
        cards: intent.cards
    });
    state.players.sort((a, b) => a.seat - b.seat);
  }
  return state;
}

function handleNewStreet(state: OHHData, intent: Extract<PokerIntent, { type: "NEW_STREET" }>): OHHData {
    // 1. Check if the street already exists (idempotency)
    const existingRound = state.rounds.find(r => r.street.toLowerCase() === intent.street.toLowerCase());
    if (existingRound) {
        // If it exists, just update cards if provided
        if (intent.cards && intent.cards.length > 0) {
            existingRound.cards = intent.cards;
        }
        return state;
    }

    // 2. Resolve implicit folds for the PREVIOUS round before starting new one
    // Actually, "New Street" usually implies all action closed on previous street.
    // We could try to auto-fold everyone who hasn't acted, but that might be aggressive.
    // Standard poker flow: if we go to flop, previous round is over.
    
    // 3. Create new round
    const lastRoundId = state.rounds.length > 0 ? state.rounds[state.rounds.length - 1].id : -1;
    
    // Merge cards: If intent.cards only has new cards, we need to append to previous board.
    // BUT the schema prompt says "ideally all".
    // Let's rely on intent.cards being the truth for that street.
    
    state.rounds.push({
        id: lastRoundId + 1,
        street: mapStreetString(intent.street),
        cards: intent.cards,
        actions: []
    });

    return state;
}

function handlePlayerAction(state: OHHData, intent: Extract<PokerIntent, { type: "PLAYER_ACTION" }>): OHHData {
    // Ensure we have a current round. If not, create Preflop.
    let currentRound = state.rounds[state.rounds.length - 1];
    if (!currentRound) {
        currentRound = {
            id: 0,
            street: "Preflop",
            actions: []
        };
        state.rounds.push(currentRound);
    }

    // 1. RESOLVE IMPLICIT FOLDS
    // Logic: Find the last player who acted. Find the gap between them and the current actor.
    // Everyone in the gap who is still "in the hand" must be folded.
    
    const lastActorSeat = getLastActorSeat(currentRound, state);
    const currentActorSeat = intent.seat;

    if (lastActorSeat !== -1 && lastActorSeat !== currentActorSeat) {
        let seatToCheck = getNextSeat(lastActorSeat, state.table_size || 8); // Default 8 if unknown
        
        // Loop until we hit the current actor
        // Safety: max loops = table size
        let safety = 0;
        while (seatToCheck !== currentActorSeat && safety < 20) {
            if (isPlayerActiveInHand(state, seatToCheck)) {
                // He was skipped, so he folds.
                // UNLESS: Is he all-in? All-in players are skipped for actions but don't fold.
                // TODO: Check for all-in status. For now, assuming generic fold.
                
                 currentRound.actions.push({
                    action_number: currentRound.actions.length + 1,
                    player_id: getPlayerIdAtSeat(state, seatToCheck),
                    action: "Fold",
                    amount: 0
                });
            }
            seatToCheck = getNextSeat(seatToCheck, state.table_size || 8);
            safety++;
        }
    }

    // 2. ADD THE ACTION
    currentRound.actions.push({
        action_number: currentRound.actions.length + 1,
        player_id: getPlayerIdAtSeat(state, intent.seat),
        action: mapActionString(intent.action),
        amount: intent.amount || 0
    });

    return state;
}

// --- Helpers ---

function mapStreetString(s: string): "Preflop" | "Flop" | "Turn" | "River" | "Showdown" {
    // Capitalize first letter
    const formatted = s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
    return formatted as any;
}

function mapActionString(a: string): Action["action"] {
    switch (a) {
        case "POST_SB": return "Post SB";
        case "POST_BB": return "Post BB";
        case "BET": return "Bet";
        case "CALL": return "Call";
        case "RAISE": return "Raise";
        case "CHECK": return "Check";
        case "FOLD": return "Fold";
        default: return "Check";
    }
}

function getNextSeat(seat: number, tableSize: number): number {
    return (seat % tableSize) + 1;
}

function getPlayerIdAtSeat(state: OHHData, seat: number): number {
    const p = state.players.find(p => p.seat === seat);
    if (p) return p.id;
    // Fallback: create implied player? Or return seat as ID?
    // Let's assume ID = Seat for simplicity if not found (though handleGameConfig should catch this)
    return seat; 
}

function isPlayerActiveInHand(state: OHHData, seat: number): boolean {
    const p = state.players.find(p => p.seat === seat);
    if (!p) return false;

    // Check if folded in ANY round
    for (const round of state.rounds) {
        if (round.actions.some(a => a.player_id === p.id && a.action === "Fold")) {
            return false;
        }
    }
    
    return true;
}

function getLastActorSeat(round: Round, state: OHHData): number {
    if (round.actions.length > 0) {
        const lastAction = round.actions[round.actions.length - 1];
        const p = state.players.find(p => p.id === lastAction.player_id);
        return p ? p.seat : -1;
    }
    
    // If no actions in this round yet, who was the last actor?
    // Depends on street.
    // Preflop: Last 'actor' effectively is Big Blind (Seat 2 usually) because action starts at UTG (Seat 3).
    // Postflop: Action starts at SB (Seat 1). So 'last actor' is Button (Seat N).
    
    if (round.street === "Preflop") {
        // Return Big Blind Seat. 
        // Assumption: SB=1, BB=2.
        return 2; 
    } else {
        // Postflop, action starts left of button (Seat 1 if button is last).
        // So effectively the "last actor" was the Button.
        return state.dealer_seat || state.table_size || 8;
    }
}

