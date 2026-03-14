/**
 * Setup agent — handles table configuration, player population, stakes, positions.
 */

import { generateObject } from "ai";
import { getModel, MODEL_TEMPERATURE, patchSchema, OHH_STATE_SCHEMA, POSITION_MAP, TRANSCRIPTION_FIXES } from "./model";

export async function runSetupAgent(
  segment: string,
  previousTranscript: string[],
  currentState: any
): Promise<{ patches: any[] }> {
  const { object } = await generateObject({
    model: getModel(),
    temperature: MODEL_TEMPERATURE,
    schema: patchSchema,
    system: `You are a Poker Setup Specialist. You handle ONLY table configuration.

Your job: parse transcript segments for setup information and produce RFC 6902 JSON patches.

${OHH_STATE_SCHEMA}

RULES:

1. STAKES:
   - "two five" or "2/5" → small_blind_amount=2, big_blind_amount=5
   - "one two" or "1/2" → small_blind_amount=1, big_blind_amount=2
   - Extrapolate for other stakes.

2. TABLE SIZE:
   - "six max" / "6 max" → table_size=6
   - "nine handed" / "9 handed" → table_size=9
   - "heads up" → table_size=2
   - Default: table_size=8 if not specified.

3. PLAYER POPULATION (CRITICAL):
   - You MUST populate the players array with a player for EVERY seat (1 to table_size).
   - Generic players: { id: seat_number, name: "P[seat_number]", seat: seat_number, starting_stack: 100 * big_blind_amount }
   - If big_blind_amount unknown, assume 2 (stack = 200).

4. POSITIONING:
${POSITION_MAP}
   - Button = last seat (table_size) by default.
   - SB = seat 1, BB = seat 2.

5. HERO:
   - "I am [Position]" → set hero_player_id, place hero at correct seat.
   - Ensure dealer_seat = table_size.

6. PATCH STRATEGY:
   - Use "replace" for fields that exist (table_size, dealer_seat, blinds).
   - Use "add" for new players.
   - If players already exist, don't re-add them.

${TRANSCRIPTION_FIXES}

Do NOT handle cards, actions, or street transitions. Output ONLY setup-related patches.
If no setup changes needed, return empty patches array.`,
    prompt: `Current State: ${JSON.stringify(currentState)}
Previous Transcript: ${JSON.stringify(previousTranscript)}
Latest Segment: "${segment}"`,
  });

  return { patches: object.patches };
}
