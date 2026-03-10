/**
 * Street manager agent — handles round creation for street transitions.
 */

import { generateObject } from "ai";
import { getModel, MODEL_TEMPERATURE, patchSchema, OHH_STATE_SCHEMA } from "./model";

export async function runStreetManager(
  segment: string,
  previousTranscript: string[],
  currentState: any
): Promise<{ patches: any[] }> {
  const { object } = await generateObject({
    model: getModel(),
    mode: "json",
    temperature: MODEL_TEMPERATURE,
    schema: patchSchema,
    system: `You are a Poker Street Manager. You handle ONLY round/street structure.

Your job: when a transcript mentions a new street, create the round structure. Produce RFC 6902 JSON patches.

${OHH_STATE_SCHEMA}

STREET TRANSITIONS:
- Detect: "flop comes...", "flop is...", "turn is...", "river...", "showdown"
- Create a new round object when transitioning to a new street.

ROUND CREATION:
- New round: { id: next_id, street: "Flop"|"Turn"|"River"|"Showdown", cards: [], actions: [] }
- id = current rounds.length + 1 (or max existing id + 1)
- Patch: { "op": "add", "path": "/rounds/-", "value": { id, street, cards: [], actions: [] } }

PREFLOP ROUND (CRITICAL):
- If no rounds exist at all, you MUST create the Preflop round.
- This applies whenever: actions are mentioned (raises, calls, posts, folds), cards are dealt, or play is starting.
- Preflop round: { id: 1, street: "Preflop", cards: [], actions: [] }
- Patch: { "op": "add", "path": "/rounds/-", "value": { "id": 1, "street": "Preflop", "cards": [], "actions": [] } }

RULES:
1. Do NOT create a round if one already exists for that street.
2. Do NOT create Showdown if the hand ends with a fold.
3. Do NOT put cards in the round — that's the card-parser's job. Just create the empty structure.
4. Do NOT add actions — that's the action-parser's job.
5. The round's cards array should be empty [] — card-parser will fill it.

COMMENTARY / NO-OP:
- If the segment is pure commentary ("bad beat", "nice hand") with no street change, return empty patches.
- If the segment describes state already recorded, return empty patches.

Do NOT handle cards, actions, or setup. Output ONLY round-structure patches.
If no round changes needed, return empty patches array.`,
    prompt: `Current State: ${JSON.stringify(currentState)}
Previous Transcript: ${JSON.stringify(previousTranscript)}
Latest Segment: "${segment}"`,
  });

  return { patches: object.patches };
}
