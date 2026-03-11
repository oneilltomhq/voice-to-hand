# Voice-to-Hand Roadmap

## Next: Solver Integration

Validate that generated OHH is solver-ingestible and produces valid GTO outputs.

- Integrate TexasSolver and/or WASM Postflop solver as a second eval suite
- Test: OHH → solver input conversion → solver run → valid output
- Evaluate whether the pipeline produces hands that are "solvable" (legal game trees, correct pot/stack math)
- Use solver outputs as a stronger correctness signal than golden-OHH comparison alone

## Eval Improvements

### Layer 1: ASR Eval

We currently only eval the LLM half of the pipeline (transcript → OHH). To eval Deepgram's transcription quality:

- Record real poker audio clips (home game commentary, training hand reviews)
- Run through Deepgram with current `deepgram-config.ts` settings (keywords, replace)
- Compare output transcripts against human-written golden transcripts
- Measure: WER (word error rate), poker-term accuracy, position-name accuracy
- A/B test: with vs without `keywords`/`replace` to quantify their impact

### Layer 3: End-to-End Eval

Full pipeline test: audio → Deepgram → LLM → OHH → scored against golden OHH.

- Combines Layer 1 + Layer 2, catches errors that compound across stages
- Requires the audio clip corpus from Layer 1
- Most realistic measure of production quality

### Expand Eval Cases

Current suite is 17 cases. Known gaps:

- Multi-way all-in / side pots
- Antes
- Bomb pots
- Mixed games (PLO, short deck)
- Real-world rambling, false starts, self-corrections
- Multiple speakers (with diarization)

## Deepgram: Speaker Diarization

Currently we assume a single narrator describing the hand. Diarization (`diarize: true`) would let Deepgram label which speaker said what, enabling:

- Multi-speaker home game recording ("I raise" from one player, "I call" from another)
- Distinguishing hero narration from table talk / banter
- Attributing actions to specific players by voice rather than by name

Requires rethinking the pipeline to handle speaker-tagged transcript segments.
