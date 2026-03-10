/**
 * Classifier agent — determines what type(s) of update a transcript segment requires.
 */

import { generateObject } from "ai";
import { z } from "zod";
import { getModel, OHH_STATE_SCHEMA } from "./model";

const classificationSchema = z.object({
  types: z.array(
    z.enum(["setup", "cards", "actions", "street_transition", "noop"])
  ),
  reasoning: z.string(),
});

export type SegmentType = "setup" | "cards" | "actions" | "street_transition" | "noop";

export interface Classification {
  types: SegmentType[];
  reasoning: string;
}

export async function classifySegment(
  segment: string,
  previousTranscript: string[],
  currentState: any
): Promise<Classification> {
  const { object } = await generateObject({
    model: getModel(),
    mode: "json",
    schema: classificationSchema,
    system: `You are a poker transcript classifier. Given a transcript segment and the current game state, determine what type(s) of update are needed.

Categories (a segment can trigger MULTIPLE):
- "setup": Mentions stakes ("two five", "1/2"), table size ("6 max", "9 handed"), player positions ("I'm UTG"), or player identity.
- "cards": Mentions specific cards — hole cards ("I get dealt ace king", "pocket sevens") or board cards ("flop comes...", "turn is a king").
- "street_transition": Announces a new street ("flop comes", "turn is", "river", "showdown"). Often paired with "cards".
- "actions": Describes betting actions — bets, raises, calls, checks, folds, limps, 3-bets, all-in, or anything implying player action order.
- "noop": Pure commentary with no game state change ("bad beat", "that's crazy"), OR info already fully recorded in current state.

Rules:
- "Flop comes ace seven deuce, I bet 15" → ["street_transition", "cards", "actions"]
- "I get dealt pocket aces" → ["cards"]
- "UTG raises to 7, button calls" → ["actions"]
- "Two five game, six max" → ["setup"]
- "Nice hand" → ["noop"]
- If a segment says "I'm UTG and I raise to 7" → ["setup", "actions"]
- A segment with ONLY a trailing subject ("The big blind...") and no action → ["noop"]

${OHH_STATE_SCHEMA}

Return a JSON object with "types" (array of categories) and "reasoning" (brief explanation).`,
    prompt: `Current State: ${JSON.stringify(currentState)}
Previous Transcript: ${JSON.stringify(previousTranscript)}
Latest Segment: "${segment}"`,
  });

  return object as Classification;
}
