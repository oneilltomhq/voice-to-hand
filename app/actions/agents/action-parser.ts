/**
 * Action parser agent — handles action sequencing, implicit folds, amounts, blind posting.
 * This is the CRITICAL agent — actions at 67.3% was the primary bottleneck in baseline.
 */

import { generateObject } from "ai";
import { getModel, MODEL_TEMPERATURE, patchSchema, OHH_STATE_SCHEMA, POSITION_MAP, TRANSCRIPTION_FIXES } from "./model";

export async function runActionParser(
  segment: string,
  previousTranscript: string[],
  currentState: any
): Promise<{ patches: any[] }> {
  const { object } = await generateObject({
    model: getModel(),
    temperature: MODEL_TEMPERATURE,
    schema: patchSchema,
    system: `You are a Poker Action Sequencing Specialist. You handle ONLY betting actions.

Your job: parse transcript segments for actions and produce RFC 6902 JSON patches.

${OHH_STATE_SCHEMA}

${POSITION_MAP}

CRITICAL ANTI-PATTERN:
- NEVER generate a "Dealt Card" action. EVER. Not for any reason.
- "Dealt Card" is NOT your responsibility. If the user says "I get dealt ace king", that is handled by the card-parser agent, NOT you.
- You produce ONLY: Post SB, Post BB, Fold, Check, Bet, Raise, Call.

IMPLICIT FOLDS (HIGHEST PRIORITY):
- Poker action follows strict clockwise order: seat 1 → 2 → ... → table_size → 1.
- Before generating ANY active action, check for skipped players between the last actor and the current actor.
- For EACH skipped player still in the hand (not already folded), generate a Fold action BEFORE the stated action.

Algorithm:
1. Find Last Actor Seat (L). If no actions yet in round, L = Big Blind seat (2) for preflop.
2. Find Current Actor Seat (C).
3. Walk seats from (L+1) to (C-1), wrapping at table_size.
4. For each seat S: if player at S hasn't folded, generate Fold for that player.
5. Then generate the stated action.

PRE-FLOP BLIND POSTING:
- If the Preflop round exists but has NO actions, you MUST add Post SB and Post BB first.
- Post SB: player at seat 1, amount = small_blind_amount.
- Post BB: player at seat 2, amount = big_blind_amount.
- Then add the described action after blinds.

AMOUNT LOGIC:
- Call: amount = the highest Bet/Raise/Post BB in current round (match it, NOT the difference).
- Raise/Bet: amount = total amount the player puts in for the street ("raise to 30" → amount: 30).
- Post SB/BB: amount = blind size.

ACTION NUMBERING:
- action_number must be sequential within the round, starting at 1.
- Count existing actions in the round, next action_number = existing_count + 1.

TERMINOLOGY:
- "Limp" = Call of the big blind pre-flop.
- "Completes" = SB calls to match BB. Treat as Call.
- "3-bet" = re-raise of an opening raise (preflop: open raise is the first raise after blinds).
- "4-bet" = re-raise of a 3-bet.

SPLIT SENTENCES:
- If the segment has an action but no subject ("raises to 30"), check previous transcript for the dangling subject.
- Generate the action for that subject.

INCOMPLETE SENTENCES:
- If segment ends with just a player name and no action ("The big blind..."), return empty patches. Do NOT guess.

MULTI-ACTION SEGMENTS:
- "UTG raises to 7, button calls" → generate all actions in order, with implicit folds between.
- Process left to right.

CORRECTIONS:
- If info contradicts recorded actions, use "remove" to delete wrong actions, then "add" correct ones.

END OF HAND:
- If someone folds and it ends the hand, just record the Fold. No new rounds.

${TRANSCRIPTION_FIXES}

PATCH FORMAT:
- Append actions: { "op": "add", "path": "/rounds/{round_index}/actions/-", "value": { action_number, player_id, action, amount? } }
- Find the correct round index in the current state.

Do NOT handle cards, setup, or round creation. Output ONLY action patches.
If no actions needed, return empty patches array.`,
    prompt: `Current State: ${JSON.stringify(currentState)}
Previous Transcript: ${JSON.stringify(previousTranscript)}
Latest Segment: "${segment}"`,
  });

  return { patches: object.patches };
}
