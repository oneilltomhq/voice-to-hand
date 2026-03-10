/**
 * Orchestrator — routes transcript segments through specialized agents.
 *
 * Flow: classify → dispatch to agents in order → compose patches.
 * Agent order: setup → street_manager → cards → actions
 * Each agent sees state updated by prior agents.
 */

import { applyPatch, Operation } from "rfc6902";
import { classifySegment, type SegmentType } from "./classifier";
import { runSetupAgent } from "./setup-agent";
import { runCardParser } from "./card-parser";
import { runActionParser } from "./action-parser";
import { runStreetManager } from "./street-manager";

/** Agent execution order — setup first, actions last */
const AGENT_ORDER: SegmentType[] = ["setup", "street_transition", "cards", "actions"];

type AgentFn = (
  segment: string,
  previousTranscript: string[],
  currentState: any
) => Promise<{ patches: any[] }>;

const AGENT_MAP: Record<SegmentType, AgentFn | null> = {
  setup: runSetupAgent,
  street_transition: runStreetManager,
  cards: runCardParser,
  actions: runActionParser,
  noop: null,
};

export async function generateHandHistoryPatchDecomposed(
  userInput: string,
  previousTranscript: string[],
  currentStateContext: any
): Promise<{ success: boolean; patches?: any[]; error?: string; classification?: any }> {
  try {
    // Step 1: Classify the segment
    const classification = await classifySegment(
      userInput,
      previousTranscript,
      currentStateContext
    );

    if (process.env.EVAL_VERBOSE === "1") {
      console.log(`    [classifier] types=${classification.types.join(",")} reason="${classification.reasoning}"`);
    }

    // Short-circuit for noop
    if (
      classification.types.length === 0 ||
      (classification.types.length === 1 && classification.types[0] === "noop")
    ) {
      return { success: true, patches: [], classification };
    }

    // Step 2: Ensure Preflop round exists if actions are needed
    // This is the most common coordination failure: actions classified without
    // street_transition, but no Preflop round exists yet.
    const needsActions = classification.types.includes("actions");
    const hasRounds = currentStateContext.rounds && currentStateContext.rounds.length > 0;
    if (needsActions && !hasRounds && !classification.types.includes("street_transition")) {
      classification.types = ["street_transition", ...classification.types.filter(t => t !== "street_transition")];
      if (process.env.EVAL_VERBOSE === "1") {
        console.log(`    [orchestrator] injected street_transition (no rounds exist, actions needed)`);
      }
    }

    // Step 3: Execute agents in order, accumulating patches
    const allPatches: any[] = [];
    let workingState = JSON.parse(JSON.stringify(currentStateContext));

    for (const agentType of AGENT_ORDER) {
      if (!classification.types.includes(agentType)) continue;

      const agentFn = AGENT_MAP[agentType];
      if (!agentFn) continue;

      const result = await agentFn(userInput, previousTranscript, workingState);

      if (process.env.EVAL_VERBOSE === "1") {
        console.log(`    [${agentType}] ${result.patches?.length || 0} patches`);
        if (result.patches?.length) {
          for (const p of result.patches) {
            console.log(`      ${p.op} ${p.path}`);
          }
        }
      }

      if (result.patches && result.patches.length > 0) {
        allPatches.push(...result.patches);

        // Apply patches to working state so next agent sees updated state
        const nextState = JSON.parse(JSON.stringify(workingState));
        try {
          applyPatch(nextState, result.patches as Operation[]);
          workingState = nextState;
        } catch (e) {
          // If patch application fails, continue with current state
          // The patches are still collected for the final output
          if (process.env.EVAL_VERBOSE === "1") {
            console.warn(`    [${agentType}] patch apply FAILED:`, e);
          }
        }
      }
    }

    return { success: true, patches: allPatches, classification };
  } catch (error: any) {
    console.error("Decomposed pipeline failed:", error);
    return { success: false, error: error.message || "Failed to generate patch" };
  }
}
