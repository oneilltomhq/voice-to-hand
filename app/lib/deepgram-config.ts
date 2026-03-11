/**
 * Shared Deepgram configuration for all live transcription sessions.
 *
 * `keywords` boosts recognition of poker-specific vocabulary that the
 * general Nova-3 model may not prioritize.
 *
 * `replace` performs find-and-replace at the ASR level, fixing common
 * misheard poker terms *before* the LLM ever sees them — more reliable
 * than relying on the LLM's TRANSCRIPTION_FIXES prompt.
 */
import type { LiveSchema } from "@deepgram/sdk";

/** Poker terms to boost recognition probability. */
export const DEEPGRAM_KEYWORDS: string[] = [
  // Positions
  "UTG:5",
  "UTG+1:3",
  "hijack:3",
  "cutoff:3",
  "button:3",
  "small blind:3",
  "big blind:3",
  "dealer:2",
  // Actions
  "check:2",
  "call:3",
  "raise:2",
  "fold:2",
  "bet:2",
  "all in:3",
  "straddle:3",
  "limp:3",
  "three-bet:3",
  "four-bet:3",
  // Cards
  "offsuit:3",
  "suited:3",
  "pocket:2",
  "rainbow:3",
  "flush draw:2",
  // Streets
  "preflop:3",
  "flop:3",
  "turn:2",
  "river:2",
  "showdown:3",
];

/**
 * ASR-level find-and-replace rules.
 * Format: "wrong:right" — Deepgram replaces before returning transcript.
 * These mirror TRANSCRIPTION_FIXES but fix at the source.
 */
export const DEEPGRAM_REPLACEMENTS: string[] = [
  "core:call",
  "an eye check:and I check",
  "an eye:and I",
  "bottom:button",
  "gun plus one:UTG plus one",
];

/** Base Deepgram LiveSchema for poker transcription. */
export function getDeepgramOptions(overrides?: Partial<LiveSchema>): LiveSchema {
  return {
    model: "nova-3",
    interim_results: true,
    smart_format: true,
    vad_events: true,
    keywords: DEEPGRAM_KEYWORDS,
    replace: DEEPGRAM_REPLACEMENTS,
    ...overrides,
  };
}
