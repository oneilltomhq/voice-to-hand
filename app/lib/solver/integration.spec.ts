import { describe, it, expect } from 'vitest';
import { ohhToSolverInput } from './ohh-to-solver';
import { runSolver } from './solver-bridge';
import { OHHData } from '../OpenHandHistory';

// This test actually invokes the Rust solver binary.
// It takes a few seconds. Skip in CI with SKIP_SOLVER=1.
const SKIP = process.env.SKIP_SOLVER === '1';

describe.skipIf(SKIP)('solver integration (end-to-end)', () => {
  it('solves a BTN vs BB turn spot from OHH', async () => {
    const ohh: OHHData = {
      spec_version: '1.4.6',
      internal_version: '1.4.6',
      network_name: 'Test',
      site_name: 'Test',
      game_type: 'Holdem',
      table_name: 'Test',
      table_size: 6,
      game_number: '1',
      start_date_utc: '2024-01-01',
      currency: 'Chips',
      ante_amount: 0,
      small_blind_amount: 1,
      big_blind_amount: 2,
      bet_limit: { bet_cap: 0, bet_type: 'NL' },
      dealer_seat: 6,
      hero_player_id: 2,
      players: [
        { id: 1, name: 'SB', seat: 1, starting_stack: 200 },
        { id: 2, name: 'Hero', seat: 2, starting_stack: 200, cards: ['Kh', 'Jd'] },
        { id: 3, name: 'UTG', seat: 3, starting_stack: 200 },
        { id: 4, name: 'MP', seat: 4, starting_stack: 200 },
        { id: 5, name: 'CO', seat: 5, starting_stack: 200 },
        { id: 6, name: 'BTN', seat: 6, starting_stack: 200 },
      ],
      rounds: [
        {
          id: 0,
          street: 'Preflop',
          actions: [
            { action_number: 1, player_id: 1, action: 'Post SB', amount: 1 },
            { action_number: 2, player_id: 2, action: 'Post BB', amount: 2 },
            { action_number: 3, player_id: 3, action: 'Fold' },
            { action_number: 4, player_id: 4, action: 'Fold' },
            { action_number: 5, player_id: 5, action: 'Fold' },
            { action_number: 6, player_id: 6, action: 'Raise', amount: 5 },
            { action_number: 7, player_id: 1, action: 'Fold' },
            { action_number: 8, player_id: 2, action: 'Call', amount: 5 },
          ],
        },
        {
          id: 1,
          street: 'Flop',
          cards: ['Qs', '9h', '3c'],
          actions: [
            { action_number: 1, player_id: 2, action: 'Check' },
            { action_number: 2, player_id: 6, action: 'Bet', amount: 8 },
            { action_number: 3, player_id: 2, action: 'Call', amount: 8 },
          ],
        },
        {
          id: 2,
          street: 'Turn',
          cards: ['Qs', '9h', '3c', '6d'],
          actions: [
            { action_number: 1, player_id: 2, action: 'Check' },
            { action_number: 2, player_id: 6, action: 'Check' },
          ],
        },
      ],
      pots: [],
    };

    // Step 1: Transform OHH to solver input
    // Use TAG archetypes for manageable tree size on 2-core VM
    const archetypes = new Map<number, 'tag'>([[2, 'tag'], [6, 'tag']]);
    const transform = ohhToSolverInput(ohh, { archetypes });
    expect(transform.ok).toBe(true);
    if (!transform.ok) return;

    console.log('Solver input:', JSON.stringify(transform.input, null, 2));
    console.log('Players:', transform.players);

    // Step 2: Run the solver
    const result = await runSolver(transform.input, {
      maxIterations: 100,
      targetExploitabilityPct: 1.0,
      timeoutMs: 45_000,
    });

    console.log('Solver result:', JSON.stringify(result, null, 2));

    // Step 3: Validate output
    expect(result.exploitability).toBeDefined();
    expect(result.solve_time_ms).toBeGreaterThan(0);
    expect(result.oop_equity).toBeGreaterThan(0);
    expect(result.oop_equity).toBeLessThan(1);
    expect(result.ip_equity).toBeGreaterThan(0);
    expect(result.actions.length).toBeGreaterThan(1); // at least Check + Bet
    expect(Object.keys(result.strategy).length).toBeGreaterThan(0);

    // Strategy values should sum to ~1.0 for each hand
    for (const [hand, probs] of Object.entries(result.strategy)) {
      const sum = Object.values(probs).reduce((a, b) => a + b, 0);
      expect(sum).toBeCloseTo(1.0, 1); // within 0.1
    }
  }, 60_000); // 60s timeout

  it('solves a river spot', async () => {
    const ohh: OHHData = {
      spec_version: '1.4.6',
      internal_version: '1.4.6',
      network_name: 'Test',
      site_name: 'Test',
      game_type: 'Holdem',
      table_name: 'Test',
      table_size: 6,
      game_number: '1',
      start_date_utc: '2024-01-01',
      currency: 'Chips',
      ante_amount: 0,
      small_blind_amount: 1,
      big_blind_amount: 2,
      bet_limit: { bet_cap: 0, bet_type: 'NL' },
      dealer_seat: 6,
      hero_player_id: 2,
      players: [
        { id: 1, name: 'SB', seat: 1, starting_stack: 200 },
        { id: 2, name: 'Hero', seat: 2, starting_stack: 200, cards: ['Ah', '5h'] },
        { id: 3, name: 'UTG', seat: 3, starting_stack: 200 },
        { id: 4, name: 'MP', seat: 4, starting_stack: 200 },
        { id: 5, name: 'CO', seat: 5, starting_stack: 200 },
        { id: 6, name: 'BTN', seat: 6, starting_stack: 200 },
      ],
      rounds: [
        {
          id: 0,
          street: 'Preflop',
          actions: [
            { action_number: 1, player_id: 1, action: 'Post SB', amount: 1 },
            { action_number: 2, player_id: 2, action: 'Post BB', amount: 2 },
            { action_number: 3, player_id: 3, action: 'Fold' },
            { action_number: 4, player_id: 4, action: 'Fold' },
            { action_number: 5, player_id: 5, action: 'Fold' },
            { action_number: 6, player_id: 6, action: 'Raise', amount: 5 },
            { action_number: 7, player_id: 1, action: 'Fold' },
            { action_number: 8, player_id: 2, action: 'Call', amount: 5 },
          ],
        },
        {
          id: 1,
          street: 'Flop',
          cards: ['Th', '7h', '2c'],
          actions: [
            { action_number: 1, player_id: 2, action: 'Check' },
            { action_number: 2, player_id: 6, action: 'Bet', amount: 7 },
            { action_number: 3, player_id: 2, action: 'Call', amount: 7 },
          ],
        },
        {
          id: 2,
          street: 'Turn',
          cards: ['Th', '7h', '2c', 'Ks'],
          actions: [
            { action_number: 1, player_id: 2, action: 'Check' },
            { action_number: 2, player_id: 6, action: 'Bet', amount: 15 },
            { action_number: 3, player_id: 2, action: 'Call', amount: 15 },
          ],
        },
        {
          id: 3,
          street: 'River',
          cards: ['Th', '7h', '2c', 'Ks', '3d'],
          actions: [
            { action_number: 1, player_id: 2, action: 'Check' },
            { action_number: 2, player_id: 6, action: 'Bet', amount: 30 },
          ],
        },
      ],
      pots: [],
    };

    const archetypes = new Map<number, 'tag'>([[2, 'tag'], [6, 'tag']]);
    const transform = ohhToSolverInput(ohh, { archetypes });
    expect(transform.ok).toBe(true);
    if (!transform.ok) return;

    console.log('River solver input:', JSON.stringify(transform.input, null, 2));

    const result = await runSolver(transform.input, {
      maxIterations: 200,
      targetExploitabilityPct: 0.5,
      timeoutMs: 10_000, // River should be fast
    });

    console.log('River solver result:', JSON.stringify(result, null, 2));

    // River solves should be very fast
    expect(result.solve_time_ms).toBeLessThan(5000);
    expect(result.exploitability).toBeDefined();
    expect(result.actions.length).toBeGreaterThan(1);
  }, 30_000);
});
