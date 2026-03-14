# Voice-to-Hand Eval Suite

Systematic evaluation of the voice-to-poker transcript pipeline. Measures how accurately the LLM converts natural language poker narration into structured OpenHandHistory (OHH) format.

## Quick start

```bash
# Set your API key
echo 'GROQ_API_KEY=your_key' > .env.local

# Run all 17 eval cases
pnpm eval

# Run a subset by id or tag
pnpm eval -- --filter hu          # heads-up cases
pnpm eval -- --filter asr          # ASR error cases
pnpm eval -- --filter 9-handed     # 9-handed cases

# Verbose mode (print per-step patches)
pnpm eval:verbose
```

## What it measures

### Scoring dimensions

| Dimension | Weight | What it checks |
|---|---|---|
| **setup** | 15% | table_size, dealer_seat, blinds, hero position |
| **players** | 15% | Correct count, seat mapping, hole cards |
| **card_notation** | 10% | All cards use `Rank + suit` format (e.g. `Ts`, never `10s`) |
| **actions** | 40% | Per-round action sequence: player, type, amount, order |
| **invariants** | 20% | No duplicate cards, no double folds, sequential action numbers |

### Failure mode coverage

Each eval case targets specific failure modes:

- **Position logic**: heads-up, 6-max, 8-handed, 9-handed
- **Action types**: limps, check-raises, 4-bets, all-in-for-less, walks
- **ASR robustness**: misheard words ("core" → call, "bottom" → button)
- **Fragmented input**: incomplete sentences, dangling subjects across segments
- **Street transitions**: single-utterance multi-street, cumulative board cards
- **Edge cases**: commentary no-ops, mid-hand corrections, straddles
- **Card parsing**: pocket pairs, suited connectors, rainbow boards

## Architecture

```
evals/
├── run.ts                   # CLI entry point
├── fixtures/
│   └── cases.json           # 17 annotated test cases with golden OHH
└── lib/
    ├── runner.ts            # Replays transcripts through pipeline, collects results
    └── scoring.ts           # Multi-dimensional scoring against golden reference
```

The runner replays each transcript segment-by-segment through `generateHandHistoryPatch()`, applying patches incrementally — exactly like the real pipeline. The final state is scored against the hand-authored golden OHH.

## Results format

Each run writes a timestamped JSON to `evals/results/`:

```json
[{
  "caseId": "hu-preflop-fold",
  "overall": 0.95,
  "dimensions": [
    { "dimension": "setup", "score": 1.0, "details": "perfect" },
    { "dimension": "actions", "score": 0.875, "details": "r0a3 amount: got 2, want 4" }
  ],
  "durationMs": 3200
}]
```

Compare baselines across runs to measure the impact of prompt changes or architecture refactors.

## Adding eval cases

Add entries to `evals/fixtures/cases.json`. Each case needs:

- `id`: kebab-case identifier
- `label`: human description
- `tags`: failure-mode tags (used for filtering)
- `table_size`: number
- `transcript`: array of transcript segments
- `golden_ohh`: expected final OHH state

Validation rules: cards must be `[AKQJT98765432][shdc]`, action_numbers sequential from 1 per round, no duplicate cards (board is cumulative per round).
