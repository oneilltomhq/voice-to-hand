/**
 * Bridge between Node.js and the postflop-solver Rust binary.
 *
 * Calls the solve_json example binary via child_process,
 * passing JSON on stdin and reading JSON from stdout.
 */

import { spawn } from 'child_process';
import { SolverInput } from './ohh-to-solver';
import { normalizeRange } from './range-normalizer';

// Default path to the solver binary
const DEFAULT_SOLVER_PATH = process.env.SOLVER_PATH
  || '/home/exedev/postflop-solver/target/release/examples/solve_json';

export interface SolverResult {
  exploitability: number;
  solve_time_ms: number;
  oop_equity: number;
  ip_equity: number;
  oop_ev: number;
  ip_ev: number;
  actions: string[];
  strategy: Record<string, Record<string, number>>;
  ip_actions?: string[];
  ip_strategy?: Record<string, Record<string, number>>;
}

export interface SolveOptions {
  /** Path to solver binary */
  solverPath?: string;
  /** Bet sizes string, e.g. "60%, e, a" */
  betSizes?: string;
  /** Raise sizes string, e.g. "2.5x" */
  raiseSizes?: string;
  /** Max solver iterations */
  maxIterations?: number;
  /** Target exploitability as % of pot */
  targetExploitabilityPct?: number;
  /** Timeout in milliseconds */
  timeoutMs?: number;
}

export async function runSolver(
  input: SolverInput,
  options: SolveOptions = {},
): Promise<SolverResult> {
  const solverPath = options.solverPath ?? DEFAULT_SOLVER_PATH;
  const timeout = options.timeoutMs ?? 60_000;

  const jsonInput = JSON.stringify({
    oop_range: normalizeRange(input.oopRange),
    ip_range: normalizeRange(input.ipRange),
    board: input.board,
    starting_pot: input.startingPot,
    effective_stack: input.effectiveStack,
    bet_sizes: options.betSizes ?? '60%, e, a',
    raise_sizes: options.raiseSizes ?? '2.5x',
    max_iterations: options.maxIterations ?? 200,
    target_exploitability_pct: options.targetExploitabilityPct ?? 1.0,
  });

  return new Promise<SolverResult>((resolve, reject) => {
    const child = spawn(solverPath, [], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (data) => { stdout += data.toString(); });
    child.stderr.on('data', (data) => { stderr += data.toString(); });

    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error(`Solver timed out after ${timeout}ms`));
    }, timeout);

    child.on('error', (err) => {
      clearTimeout(timer);
      reject(new Error(`Solver process error: ${err.message}`));
    });

    child.on('close', (code) => {
      clearTimeout(timer);
      if (stderr) {
        console.warn('[solver stderr]', stderr);
      }
      if (code !== 0) {
        reject(new Error(`Solver exited with code ${code}: ${stderr || stdout}`));
        return;
      }
      try {
        resolve(JSON.parse(stdout) as SolverResult);
      } catch {
        reject(new Error(`Failed to parse solver output: ${stdout}`));
      }
    });

    // Write input and close stdin
    child.stdin.write(jsonInput);
    child.stdin.end();
  });
}
