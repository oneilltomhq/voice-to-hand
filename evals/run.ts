/**
 * CLI entry point for eval runner.
 *
 * Usage:
 *   npx tsx evals/run.ts                    # run all cases
 *   npx tsx evals/run.ts --filter hu        # run cases matching 'hu'
 *   npx tsx evals/run.ts --verbose           # print per-step patches
 *   npx tsx evals/run.ts --filter asr -v    # combine flags
 */

import * as dotenv from "dotenv";
import { runEvals, type EvalCase } from "./lib/runner";
import cases from "./fixtures/cases.json";

dotenv.config({ path: ".env.local" });
dotenv.config();

const args = process.argv.slice(2);
const filterIdx = args.indexOf("--filter");
const filter = filterIdx !== -1 ? args[filterIdx + 1] : undefined;
const verbose = args.includes("--verbose") || args.includes("-v");

async function main() {
  console.log("Voice-to-Hand Eval Suite");
  console.log(`Model: ${process.env.EVAL_MODEL || "openai/gpt-oss-120b (default)"}`);
  console.log(`Cases: ${cases.length} loaded, filter: ${filter || "none"}`);

  const runs = await runEvals(cases as EvalCase[], { filter, verbose });

  // Write results to JSON for later analysis
  const output = runs.map(r => ({
    caseId: r.caseId,
    overall: r.result.overall,
    dimensions: r.result.dimensions,
    errors: r.result.errors,
    durationMs: r.durationMs,
  }));

  const fs = await import("fs");
  const outPath = `evals/results/baseline-${new Date().toISOString().slice(0, 19).replace(/:/g, "")}.json`;
  fs.mkdirSync("evals/results", { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(output, null, 2));
  console.log(`\nResults written to ${outPath}`);

  // Exit with failure if average < 70%
  const avg = runs.reduce((s, r) => s + r.result.overall, 0) / runs.length;
  process.exit(avg < 0.7 ? 1 : 0);
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
