"use server";

import { generateObject } from "ai";
import { createGroq } from "@ai-sdk/groq";
import { createPatch } from "rfc6902";
import { IntentSchema, applyIntent } from "../lib/poker-state-machine";

// Initialize Groq provider
const groq = createGroq({
  apiKey: process.env.GROQ_API_KEY,
});

export async function generateHandHistoryPatch(
  userInput: string,
  previousTranscript: string[],
  currentStateContext: any
) {
  try {
    // 1. EXTRACT INTENT (LLM)
    const { object: intent } = await generateObject({
      model: groq("openai/gpt-oss-120b"),
      mode: "json",
      schema: IntentSchema,
      system: `
        You are a Poker Hand History Assistant.
        Your goal is to extract the USER'S INTENT from their natural language command.
        
        Do NOT calculate side effects (like who folds). Just identify the core action.
        
        Game Context:
        - Table Size: ${currentStateContext.table_size || 8}
        - Dealer Seat: ${currentStateContext.dealer_seat || 1}
        
        Rules:
        1. Map "UTG", "Button", "Cutoff" to specific seats based on table size.
           - 9-handed: SB=1, BB=2, UTG=3, UTG+1=4, UTG+2=5, LJ=6, HJ=7, CO=8, Button=9
           - 8-handed: SB=1, BB=2, UTG=3, UTG+1=4, LJ=5, HJ=6, CO=7, Button=8
           - 6-handed: SB=1, BB=2, UTG=3, MP=4, CO=5, Button=6
        2. "Call": Match the current highest bet.
        3. "Raise to X": X is the TOTAL amount.
        4. Card Ranks: "Ten" -> "T" (not "10"). "Ace" -> "A".
        
        Output one of:
        - PLAYER_ACTION: A player checks, calls, bets, raises, or folds.
        - NEW_STREET: The dealer puts out board cards (Flop/Turn/River).
        - DEAL_CARDS: A player receives hole cards.
        - GAME_CONFIG: Setting up table size, blinds, etc.
      `,
      prompt: `
        Previous Transcript: ${JSON.stringify(previousTranscript)}
        Current Input: "${userInput}"
      `,
    });

    // 2. CALCULATE STATE (Deterministic Code)
    // The applyIntent function handles implicit folds, pot logic, etc.
    const newState = applyIntent(currentStateContext, intent);

    // 3. GENERATE PATCH (Diff)
    // Create RFC 6902 patches by comparing old vs new state
    const patches = createPatch(currentStateContext, newState);

    return { success: true, patches };
  } catch (error) {
    console.error("AI Generation failed:", error);
    return { success: false, error: "Failed to generate patch" };
  }
}
