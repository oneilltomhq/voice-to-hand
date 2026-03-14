/**
 * Card parser agent — handles card notation normalization, hole cards, board cards.
 */

import { generateObject } from "ai";
import { getModel, MODEL_TEMPERATURE, patchSchema, OHH_STATE_SCHEMA } from "./model";

export async function runCardParser(
  segment: string,
  previousTranscript: string[],
  currentState: any
): Promise<{ patches: any[] }> {
  const { object } = await generateObject({
    model: getModel(),
    temperature: MODEL_TEMPERATURE,
    schema: patchSchema,
    system: `You are a Poker Card Notation Specialist. You handle ONLY card parsing and assignment.

Your job: parse transcript segments for card mentions and produce RFC 6902 JSON patches.

${OHH_STATE_SCHEMA}

CARD FORMAT (CRITICAL):
- ALWAYS: Uppercase Rank + lowercase suit. Examples: As, Kd, Tc, 7h
- Rank mapping: Ace=A, King=K, Queen=Q, Jack=J, Ten=T, Nine=9, Eight=8, Seven=7, Six=6, Five=5, Four=4, Three=3, Two/Deuce=2
- NEVER use "10" for Ten. ALWAYS use "T".
- Valid suits: s (spades), h (hearts), d (diamonds), c (clubs)

HOLE CARDS:
- "I get dealt ace king" → add cards ["Ah", "Kd"] to the hero's player object
- "pocket sevens" → ["7h", "7d"]
- "pocket tens" → ["Ts", "Th"]
- Cards go on the PLAYER object: patch path "/players/{index}/cards"
- Find the player index by matching player_id in the players array.

BOARD CARDS:
- Board cards go in the round's "cards" field.
- CUMULATIVE: Turn round cards = flop cards + turn card. River = flop + turn + river.
- Example: Flop ["As", "7d", "2h"], Turn card Qc → Turn round cards: ["As", "7d", "2h", "Qc"]
- If the round for this street already exists (created by street-manager), use "replace" on its cards field.
- If no round exists yet, use "add" to create the round with cards.

SUIT INFERENCE:
- "rainbow" → all different suits (e.g., s, h, d)
- "two hearts" at end of card list → two of the cards are hearts
- If suits unknown, assign distinct suits: s, h, d, c in order.
- NEVER use 'x' as a suit. Always pick a real suit.

COMMA-SEPARATED LISTS:
- "seven, eight, nine" → ["7s", "8h", "9d"] (distinct suits)
- "Ace, seven, deuce rainbow" → ["As", "7h", "2d"]

Do NOT handle actions, setup, or street structure. Output ONLY card-related patches.
If no card changes needed, return empty patches array.`,
    prompt: `Current State: ${JSON.stringify(currentState)}
Previous Transcript: ${JSON.stringify(previousTranscript)}
Latest Segment: "${segment}"`,
  });

  return { patches: object.patches };
}
