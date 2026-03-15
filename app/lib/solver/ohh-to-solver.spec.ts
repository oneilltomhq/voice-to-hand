import { describe, it, expect } from 'vitest';
import { ohhToSolverInput, seatToPosition } from './ohh-to-solver';
import { OHHData } from '../OpenHandHistory';
import { PlayerArchetype } from './ranges';

describe('seatToPosition', () => {
  it('maps 6-max seats correctly with dealer on seat 6', () => {
    // dealer=6, tableSize=6
    // seat 6 = BTN (offset 0)
    // seat 1 = SB (offset 1)
    // seat 2 = BB (offset 2)
    // seat 3 = UTG (offset 3)
    // seat 4 = MP (offset 4)
    // seat 5 = CO (offset 5)
    expect(seatToPosition(6, 6, 6)).toBe('BTN');
    expect(seatToPosition(1, 6, 6)).toBe('SB');
    expect(seatToPosition(2, 6, 6)).toBe('BB');
    expect(seatToPosition(3, 6, 6)).toBe('UTG');
    expect(seatToPosition(4, 6, 6)).toBe('MP');
    expect(seatToPosition(5, 6, 6)).toBe('CO');
  });

  it('maps heads-up seats correctly', () => {
    expect(seatToPosition(1, 1, 2)).toBe('BTN');
    expect(seatToPosition(2, 1, 2)).toBe('BB');
  });
});

describe('ohhToSolverInput', () => {
  it('rejects a hand that ended preflop', () => {
    const ohh: OHHData = {
      spec_version: '1.4.6',
      internal_version: '1.4.6',
      network_name: 'Test',
      site_name: 'Test',
      game_type: 'Holdem',
      table_name: 'Test',
      table_size: 2,
      game_number: '1',
      start_date_utc: '2024-01-01',
      currency: 'Chips',
      ante_amount: 0,
      small_blind_amount: 1,
      big_blind_amount: 2,
      bet_limit: { bet_cap: 0, bet_type: 'NL' },
      dealer_seat: 1,
      hero_player_id: 1,
      players: [
        { id: 1, name: 'Hero', seat: 1, starting_stack: 200, cards: ['Ah', 'Kd'] },
        { id: 2, name: 'Villain', seat: 2, starting_stack: 200 },
      ],
      rounds: [
        {
          id: 0,
          street: 'Preflop',
          actions: [
            { action_number: 1, player_id: 1, action: 'Post SB', amount: 1 },
            { action_number: 2, player_id: 2, action: 'Post BB', amount: 2 },
            { action_number: 3, player_id: 1, action: 'Raise', amount: 6 },
            { action_number: 4, player_id: 2, action: 'Fold' },
          ],
        },
      ],
      pots: [],
    };

    const result = ohhToSolverInput(ohh);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('ended preflop');
    }
  });

  it('transforms a BTN open / BB call SRP through to turn', () => {
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
        { id: 1, name: 'Player 1', seat: 1, starting_stack: 200 },
        { id: 2, name: 'Hero', seat: 2, starting_stack: 200, cards: ['Kh', 'Jd'] },
        { id: 3, name: 'Player 3', seat: 3, starting_stack: 200 },
        { id: 4, name: 'Player 4', seat: 4, starting_stack: 200 },
        { id: 5, name: 'Player 5', seat: 5, starting_stack: 200 },
        { id: 6, name: 'Player 6', seat: 6, starting_stack: 200 },
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

    const result = ohhToSolverInput(ohh);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // Hero (seat 2) = BB = OOP
    // Player 6 (seat 6) = BTN = IP
    expect(result.players[0].position).toBe('BB');
    expect(result.players[0].id).toBe(2);
    expect(result.players[0].isOOP).toBe(true);
    expect(result.players[1].position).toBe('BTN');
    expect(result.players[1].id).toBe(6);

    // Board should be turn (4 cards)
    expect(result.input.board).toEqual(['Qs', '9h', '3c', '6d']);
    expect(result.input.solveStreet).toBe('Turn');

    // Pot: OHH amounts are incremental.
    // Preflop: SB posts 1, BB posts 2, BTN raises 5, BB calls 5. Total = 1+2+5+5 = 13.
    // Flop: BTN bets 8, BB calls 8. Total added = 16. Pot at turn = 13+16 = 29.
    expect(result.input.startingPot).toBe(29);

    // Stacks at turn: BB started 200, put in 2+5+8=15 preflop+flop. 200-15=185.
    // BTN started 200, put in 5+8=13. 200-13=187. Effective = min(185,187) = 185.
    expect(result.input.effectiveStack).toBe(185);

    // Ranges should be non-empty strings
    expect(result.input.oopRange.length).toBeGreaterThan(5);
    expect(result.input.ipRange.length).toBeGreaterThan(5);
  });

  it('can solve from flop when requested', () => {
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
        { id: 2, name: 'BB', seat: 2, starting_stack: 200, cards: ['Ah', '5h'] },
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
            { action_number: 5, player_id: 5, action: 'Raise', amount: 5 },
            { action_number: 6, player_id: 6, action: 'Fold' },
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
            { action_number: 2, player_id: 5, action: 'Bet', amount: 7 },
            { action_number: 3, player_id: 2, action: 'Call', amount: 7 },
          ],
        },
      ],
      pots: [],
    };

    // Solve from flop (not latest street)
    const result = ohhToSolverInput(ohh, { solveStreet: 'Flop' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.input.solveStreet).toBe('Flop');
    expect(result.input.board).toEqual(['Th', '7h', '2c']);
    // Pot at flop: SB posts 1, BB posts 2, CO raises 5, BB calls 5. = 1+2+5+5 = 13.
    expect(result.input.startingPot).toBe(13);
    // Effective stack at flop: BB has 200-2-5=193, CO has 200-5=195. Eff=193.
    expect(result.input.effectiveStack).toBe(193);
    // BB is OOP vs CO
    expect(result.players[0].position).toBe('BB');
    expect(result.players[1].position).toBe('CO');
  });

  it('rejects multiway pots', () => {
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
        { id: 2, name: 'BB', seat: 2, starting_stack: 200 },
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
            { action_number: 5, player_id: 5, action: 'Raise', amount: 5 },
            { action_number: 6, player_id: 6, action: 'Call', amount: 5 },
            { action_number: 7, player_id: 1, action: 'Fold' },
            { action_number: 8, player_id: 2, action: 'Call', amount: 5 },
          ],
        },
        {
          id: 1,
          street: 'Flop',
          cards: ['Ah', 'Kd', '3c'],
          actions: [],
        },
      ],
      pots: [],
    };

    const result = ohhToSolverInput(ohh);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('Multiway');
    }
  });

  it('uses player archetype overrides', () => {
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
        { id: 2, name: 'BB', seat: 2, starting_stack: 200, cards: ['Kh', 'Jd'] },
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
      ],
      pots: [],
    };

    // With fish archetype for BTN, ranges should be different from TAG
    const fishResult = ohhToSolverInput(ohh, {
      archetypes: new Map([[6, 'fish' as PlayerArchetype]]),
    });
    const tagResult = ohhToSolverInput(ohh, {
      archetypes: new Map([[6, 'tag' as PlayerArchetype]]),
    });

    expect(fishResult.ok).toBe(true);
    expect(tagResult.ok).toBe(true);
    if (!fishResult.ok || !tagResult.ok) return;

    // Fish BTN opens wider than TAG BTN
    expect(fishResult.input.ipRange).not.toBe(tagResult.input.ipRange);
    // Fish range string should be longer (more combos)
    expect(fishResult.input.ipRange.length).toBeGreaterThan(tagResult.input.ipRange.length);
  });
});
