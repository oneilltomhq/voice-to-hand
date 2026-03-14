# Solver Benchmark Results

## Hardware

- CPU: AMD EPYC 9554P 64-Core (2 vCPUs allocated)
- RAM: 7.2 GB
- No GPU

## Solver: postflop-solver (Rust)

Repository: https://github.com/b-inary/postflop-solver  
Algorithm: Discounted CFR with rayon multithreading  
Build: `--release --no-default-features --features rayon`

## Results (2 threads)

| Scenario | Memory | Time | Exploitability | Target |
|----------|--------|------|---------------|--------|
| River solve, 2 sizes (75%+allin) | <1 MB | <0.01s | 0.35 | 0.5% pot |
| Turn solve, 2 sizes (60%+allin) | 7 MB | 0.26s | 1.83 | 1% pot |
| Turn solve, wide ranges, 3 sizes | 59 MB | 2.59s | 1.01 | 1% pot |
| Flop solve, full tree (3 sizes) | 679 MB | 44.83s | 0.98 | 0.5% pot |

## Key Takeaways

1. **River solves are instant** (<10ms). Always viable for real-time.
2. **Turn solves with simple bet trees are sub-second** (0.26s). Real-time viable.
3. **Turn solves with wider ranges / more sizes hit 2-3 seconds**. Borderline for real-time.
4. **Flop solves take ~45 seconds** on this hardware. Not real-time, but fine for async/deep analysis.
5. **Memory is manageable** — even the full flop solve uses <700 MB.

## Scaling Projections

postflop-solver benchmarks show near-linear scaling with threads:
- 6 threads: ~3x faster → flop in ~15s, turn in ~1s
- 16 threads: ~7x faster → flop in ~6s, turn in <0.5s

A dedicated 8-16 core machine would make turn+river solves consistently sub-second
and flop solves tolerable (5-15s).

## Real-Time Strategy

For a live-play assistant (results needed in <3 seconds):

1. **River**: Always solve on-demand. Instant.
2. **Turn**: Solve on-demand with simplified bet tree (1-2 sizes). <1s even on 2 cores.
3. **Flop**: Pre-compute common spots or use simplified trees. Too slow for real-time on small hardware.
4. **Caching**: postflop-solver supports `save_data_to_file()` / `load_data_from_file()` with zstd compression. Pre-solve common boards/SPRs.

## Integration Path

1. **Phase 1** (done): Build postflop-solver, benchmark on target hardware ✓
2. **Phase 2**: Write OHH → solver input conversion (ranges, board, pot, stacks, bet sizes)
3. **Phase 3**: Build Rust CLI wrapper that takes JSON input, outputs solver results as JSON
4. **Phase 4**: Call from Node.js via child_process (prototype) or napi-rs addon (production)
5. **Phase 5**: Caching layer for common spots

## License Note

postflop-solver is AGPL-3.0. Serving results over the network triggers copyleft.
Development suspended Oct 2023 (author went commercial). Commercial license negotiation uncertain.
