/**
 * CLI entry point for eval runner.
 *
 * Usage:
 *   npx tsx evals/run.ts                    # run all cases (god prompt)
 *   npx tsx evals/run.ts --decomposed       # run with decomposed agents
 *   npx tsx evals/run.ts --filter hu        # run cases matching 'hu'
 *   npx tsx evals/run.ts --verbose           # print per-step patches
 *   npx tsx evals/run.ts --samples 3        # run each case N times, report mean ± stddev
 *   npx tsx evals/run.ts --concurrency 5    # run up to 5 cases in parallel (default: all)
 *   npx tsx evals/run.ts --decomposed -v    # combine flags
 */

import * as dotenv from "dotenv";
import { runEvals, type EvalCase } from "./lib/runner";
import cases from "./fixtures/cases.json";

dotenv.config({ path: ".env.local" });
dotenv.config();

const args = process.argv.slice(2);
const filterIdx = args.indexOf("--filter");
const filter = filterIdx !== -1 ? args[filterIdx + 1] : undefined;
const samplesIdx = args.indexOf("--samples");
const samples = samplesIdx !== -1 ? parseInt(args[samplesIdx + 1], 10) : 1;
const verbose = args.includes("--verbose") || args.includes("-v");
const decomposed = args.includes("--decomposed") || args.includes("-d");
const concurrencyIdx = args.indexOf("--concurrency");
const concurrency = concurrencyIdx !== -1 ? parseInt(args[concurrencyIdx + 1], 10) : undefined;

function stddev(values: number[]): number {
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const sq = values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length;
  return Math.sqrt(sq);
}

async function main() {
  const mode = decomposed ? "decomposed" : "god-prompt";
  console.log("Voice-to-Hand Eval Suite");
  console.log(`Mode: ${mode}`);
  console.log(`Model: ${process.env.EVAL_MODEL || "openai/gpt-oss-120b (default)"}`);
  console.log(`Samples: ${samples}`);
  console.log(`Cases: ${cases.length} loaded, filter: ${filter || "none"}, concurrency: ${concurrency || "all"}`);

  if (samples > 1) {
    // Multi-sample mode: run N times, aggregate
    const allRuns: Array<Array<{ caseId: string; overall: number; dimensions: any[] }>> = [];

    for (let s = 0; s < samples; s++) {
      console.log(`\n${'━'.repeat(60)}`);
      console.log(`SAMPLE ${s + 1}/${samples}`);
      console.log('━'.repeat(60));

      const runs = await runEvals(cases as EvalCase[], { filter, verbose, decomposed, concurrency });
      allRuns.push(runs.map(r => ({
        caseId: r.caseId,
        overall: r.result.overall,
        dimensions: r.result.dimensions,
      })));
    }

    // Aggregate
    const caseIds = allRuns[0].map(r => r.caseId);
    console.log(`\n${'═'.repeat(60)}`);
    console.log(`MULTI-SAMPLE SUMMARY (n=${samples})`);
    console.log('═'.repeat(60));
    console.log(`${'Case'.padEnd(42)} ${'Mean'.padStart(7)} ${'StdDev'.padStart(7)} ${'Min'.padStart(7)} ${'Max'.padStart(7)}`);
    console.log('-'.repeat(70));

    const caseMeans: number[] = [];
    for (const caseId of caseIds) {
      const scores = allRuns.map(run => run.find(r => r.caseId === caseId)!.overall);
      const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
      const sd = stddev(scores);
      caseMeans.push(mean);
      const flag = sd > 0.05 ? '⚠️' : '  ';
      console.log(`${flag}${caseId.padEnd(40)} ${(mean * 100).toFixed(1).padStart(6)}% ${(sd * 100).toFixed(1).padStart(6)}% ${(Math.min(...scores) * 100).toFixed(1).padStart(6)}% ${(Math.max(...scores) * 100).toFixed(1).padStart(6)}%`);
    }

    console.log('-'.repeat(70));
    const overallMean = caseMeans.reduce((a, b) => a + b, 0) / caseMeans.length;
    const overallSd = stddev(caseMeans);
    console.log(`${'  OVERALL'.padEnd(42)} ${(overallMean * 100).toFixed(1).padStart(6)}% ${(overallSd * 100).toFixed(1).padStart(6)}%`);

    // Flag high-variance cases
    const highVar = caseIds.filter(id => {
      const scores = allRuns.map(run => run.find(r => r.caseId === id)!.overall);
      return stddev(scores) > 0.05;
    });
    if (highVar.length > 0) {
      console.log(`\n⚠️  High variance cases (stddev > 5%): ${highVar.join(', ')}`);
    }

    // Write aggregate results
    const fs = await import("fs");
    const prefix = decomposed ? "decomposed" : "baseline";
    const outPath = `evals/results/${prefix}-${samples}samples-${new Date().toISOString().slice(0, 19).replace(/:/g, "")}.json`;
    fs.mkdirSync("evals/results", { recursive: true });
    fs.writeFileSync(outPath, JSON.stringify({ samples, runs: allRuns }, null, 2));
    console.log(`\nResults written to ${outPath}`);
    console.log('═'.repeat(60));

    process.exit(overallMean < 0.7 ? 1 : 0);
  } else {
    // Single-sample mode (original behavior)
    const runs = await runEvals(cases as EvalCase[], { filter, verbose, decomposed, concurrency });

    const output = runs.map(r => ({
      caseId: r.caseId,
      overall: r.result.overall,
      dimensions: r.result.dimensions,
      errors: r.result.errors,
      durationMs: r.durationMs,
    }));

    const fs = await import("fs");
    const prefix = decomposed ? "decomposed" : "baseline";
    const outPath = `evals/results/${prefix}-${new Date().toISOString().slice(0, 19).replace(/:/g, "")}.json`;
    fs.mkdirSync("evals/results", { recursive: true });
    fs.writeFileSync(outPath, JSON.stringify(output, null, 2));
    console.log(`\nResults written to ${outPath}`);

    const avg = runs.reduce((s, r) => s + r.result.overall, 0) / runs.length;
    process.exit(avg < 0.7 ? 1 : 0);
  }
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
