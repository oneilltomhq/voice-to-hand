/**
 * Shared model configuration, schemas, and constants for all agents.
 */

import { createGroq } from "@ai-sdk/groq";
import { createOpenAI } from "@ai-sdk/openai";
import { z } from "zod";

/** Temperature for all eval/pipeline calls. 0 = deterministic. */
export const MODEL_TEMPERATURE = 0;

export function getModel() {
  const provider = process.env.EVAL_PROVIDER || "groq";
  const modelId = process.env.EVAL_MODEL || "openai/gpt-oss-120b";

  if (provider === "fireworks") {
    const fireworks = createOpenAI({
      apiKey: process.env.FIREWORKS_API_KEY,
      baseURL: "https://api.fireworks.ai/inference/v1",
    });
    const fwModelId = modelId.startsWith("accounts/")
      ? modelId
      : `accounts/fireworks/models/${modelId.replace("openai/", "")}`;
    return fireworks.chat(fwModelId);
  }

  if (provider === "openrouter") {
    const openrouter = createOpenAI({
      apiKey: process.env.OPENROUTER_API_KEY,
      baseURL: "https://openrouter.ai/api/v1",
    });
    return openrouter.chat(modelId);
  }

  const groq = createGroq({
    apiKey: process.env.GROQ_API_KEY,
  });
  return groq(modelId);
}

/**
 * JSON Patch value — must be a concrete union rather than z.any() because
 * many providers (DeepSeek, Mixtral on Fireworks) reject the empty `{}`
 * JSON Schema that z.any() produces.
 *
 * For our OHH patches, values are primitives, card arrays, or action/player/round objects.
 */
const ohhAction = z.object({
  action_number: z.number(),
  player_id: z.number(),
  action: z.string(),
  amount: z.number().optional(),
  is_allin: z.boolean().optional(),
});

const ohhPlayer = z.object({
  id: z.number(),
  name: z.string(),
  seat: z.number(),
  starting_stack: z.number().optional(),
  cards: z.array(z.string()).optional(),
});

const ohhRound = z.object({
  id: z.number(),
  street: z.string(),
  cards: z.array(z.string()).optional(),
  actions: z.array(ohhAction).optional(),
});

const jsonPatchValue = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.null(),
  z.array(z.string()),        // card arrays, etc.
  z.array(ohhAction),          // actions array
  z.array(ohhPlayer),          // players array
  z.array(ohhRound),           // rounds array
  ohhAction,                   // single action object
  ohhPlayer,                   // single player object
  ohhRound,                    // single round object
]).optional();

export const patchSchema = z.object({
  patches: z.array(
    z.object({
      op: z.enum(["add", "remove", "replace", "move", "copy", "test"]),
      path: z.string(),
      value: jsonPatchValue,
      from: z.string().optional(),
    })
  ),
});

/**
 * Compact OHH state description shared across agents.
 * Each agent only needs to know the structure to generate valid patches.
 */
export const OHH_STATE_SCHEMA = `
The game state follows OpenHandHistory (OHH) format:
{
  table_size: number,
  dealer_seat: number,
  hero_player_id: number,
  small_blind_amount: number,
  big_blind_amount: number,
  players: Array<{ id: number, name: string, seat: number, starting_stack: number, cards?: string[] }>,
  rounds: Array<{
    id: number,
    cards?: string[],
    street: "Preflop" | "Flop" | "Turn" | "River" | "Showdown",
    actions: Array<{
      action_number: number,
      player_id: number,
      action: "Dealt Card" | "Post SB" | "Post BB" | "Fold" | "Check" | "Bet" | "Raise" | "Call",
      amount?: number,
      is_allin?: boolean
    }>
  }>
}
`;

export const POSITION_MAP = `
Default positions (Button = last seat):
- 9-handed: SB=1, BB=2, UTG=3, UTG+1=4, UTG+2=5, LJ=6, HJ=7, CO=8, BTN=9
- 8-handed: SB=1, BB=2, UTG=3, UTG+1=4, LJ=5, HJ=6, CO=7, BTN=8
- 6-handed: SB=1, BB=2, UTG=3, MP=4, CO=5, BTN=6
- Heads-up: BTN/SB=1, BB=2
`;

/**
 * @deprecated Transcription fixes are now handled at the Deepgram ASR level
 * via `replace` in app/lib/deepgram-config.ts. Keeping for reference only.
 */
export const TRANSCRIPTION_FIXES = "";
