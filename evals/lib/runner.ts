/**
 * Eval runner — replays transcript segments through the pipeline
 * and compares final state against golden OHH.
 */

import { generateHandHistoryPatch } from "../../app/actions/generate-hand-history-patch";
import { generateHandHistoryPatchDecomposed } from "../../app/actions/agents/orchestrator";
import { OpenHandHistory } from "../../app/lib/OpenHandHistory";
import { applyPatch, Operation } from "rfc6902";
import { scoreEval, formatEvalResult, type EvalResult } from "./scoring";
import type { OHHData } from "../../app/lib/OpenHandHistory";

export interface EvalCase {
  id: string;
  label: string;
  tags: string[];
  table_size: number;
  transcript: string[];
  golden_ohh: Partial<OHHData>; // partial is fine — scoring handles missing fields
}

export interface RunOptions {
  /** If set, only run cases whose id or tags match this filter */
  filter?: string;
  /** Max concurrent cases (default 1 — sequential for rate limits) */
  concurrency?: number;
  /** Print per-step patches for debugging */
  verbose?: boolean;
  /** Use decomposed multi-agent pipeline instead of god prompt */
  decomposed?: boolean;
}

export interface StepLog {
  segment: string;
  patches: any[];
  stateAfter: any;
  error?: string;
}

export interface CaseRun {
  caseId: string;
  steps: StepLog[];
  finalState: OHHData;
  result: EvalResult;
  durationMs: number;
}

async function runCase(evalCase: EvalCase, verbose: boolean, decomposed: boolean): Promise<CaseRun> {
  const start = Date.now();
  let state = new OpenHandHistory().toJSON().ohh;
  const transcriptHistory: string[] = [];
  const steps: StepLog[] = [];

  for (const segment of evalCase.transcript) {
    const stepLog: StepLog = { segment, patches: [], stateAfter: null };

    try {
      const context = {
        table_size: state.table_size,
        players: state.players,
        dealer_seat: state.dealer_seat,
        small_blind_amount: state.small_blind_amount,
        big_blind_amount: state.big_blind_amount,
        hero_player_id: state.hero_player_id,
        rounds: state.rounds,
      };

      const result = decomposed
        ? await generateHandHistoryPatchDecomposed(segment, transcriptHistory, context)
        : await generateHandHistoryPatch(segment, transcriptHistory, context);

      if (result.success && result.patches && result.patches.length > 0) {
        stepLog.patches = result.patches;
        const newState = JSON.parse(JSON.stringify(state));
        applyPatch(newState, result.patches as Operation[]);
        state = newState;
      } else if (!result.success) {
        stepLog.error = result.error || "unknown";
      }
    } catch (e: any) {
      stepLog.error = e.message;
    }

    stepLog.stateAfter = JSON.parse(JSON.stringify(state));
    steps.push(stepLog);
    transcriptHistory.push(segment);

    if (verbose) {
      console.log(`  ▶ "${segment}"`);
      if (stepLog.patches.length > 0) {
        console.log(`    ${stepLog.patches.length} patches`);
      }
      if (stepLog.error) {
        console.log(`    ⚠ ${stepLog.error}`);
      }
    }
  }

  const result = scoreEval(evalCase.id, state, evalCase.golden_ohh as OHHData);
  const durationMs = Date.now() - start;

  return { caseId: evalCase.id, steps, finalState: state, result, durationMs };
}

export async function runEvals(
  cases: EvalCase[],
  opts: RunOptions = {}
): Promise<CaseRun[]> {
  const { filter, verbose = false, decomposed = false } = opts;

  let filtered = cases;
  if (filter) {
    filtered = cases.filter(
      c => c.id.includes(filter) || c.tags.some(t => t.includes(filter))
    );
  }

  console.log(`\nRunning ${filtered.length} eval cases...\n`);

  const concurrency = opts.concurrency ?? filtered.length; // default: all parallel

  const runs: CaseRun[] = new Array(filtered.length);
  let nextIdx = 0;

  async function worker() {
    while (nextIdx < filtered.length) {
      const idx = nextIdx++;
      const c = filtered[idx];
      console.log(`○ ${c.id} (${c.label})`);
      const run = await runCase(c, verbose, decomposed);
      runs[idx] = run;
      console.log(formatEvalResult(run.result));
      console.log(`  ⏱ ${(run.durationMs / 1000).toFixed(1)}s\n`);
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, filtered.length) }, () => worker());
  await Promise.all(workers);

  // Summary
  const avg = runs.reduce((s, r) => s + r.result.overall, 0) / runs.length;
  const perfect = runs.filter(r => r.result.overall === 1).length;

  console.log("\n" + "=".repeat(60));
  console.log(`SUMMARY: ${runs.length} cases | avg ${(avg * 100).toFixed(1)}% | ${perfect} perfect`);

  // Per-dimension averages
  const dimNames = ["setup", "players", "card_notation", "actions", "invariants"];
  for (const dim of dimNames) {
    const dimScores = runs
      .map(r => r.result.dimensions.find(d => d.dimension === dim)?.score ?? 0);
    const dimAvg = dimScores.reduce((a, b) => a + b, 0) / dimScores.length;
    console.log(`  ${dim}: ${(dimAvg * 100).toFixed(1)}%`);
  }

  // Tag-level breakdown
  const tagScores = new Map<string, number[]>();
  for (const run of runs) {
    const c = filtered.find(x => x.id === run.caseId)!;
    for (const tag of c.tags) {
      if (!tagScores.has(tag)) tagScores.set(tag, []);
      tagScores.get(tag)!.push(run.result.overall);
    }
  }
  console.log("\nBy tag:");
  for (const [tag, scores] of [...tagScores.entries()].sort()) {
    const tagAvg = scores.reduce((a, b) => a + b, 0) / scores.length;
    console.log(`  ${tag}: ${(tagAvg * 100).toFixed(1)}% (n=${scores.length})`);
  }
  console.log("=".repeat(60));

  return runs;
}
