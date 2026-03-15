/**
 * Normalize range strings so that dash ranges are in descending order,
 * which is what the postflop-solver expects.
 *
 * e.g. "T8o-T9o" → "T9o-T8o", "A2s-AJs" → "AJs-A2s"
 *
 * The solver's range parser expects the higher-ranked hand first
 * in a dash range.
 */

const RANK_ORDER = '23456789TJQKA';

function rankValue(r: string): number {
  return RANK_ORDER.indexOf(r);
}

/** Compare two hand notations like "T8o" and "T9o" */
function handRank(hand: string): number {
  // A hand like "T8o" or "AJs" or "22"
  // First char is the high card, second is the kicker
  const high = rankValue(hand[0]);
  const low = rankValue(hand[1]);
  // Higher high card wins, then higher kicker
  return high * 100 + low;
}

export function normalizeRange(range: string): string {
  return range.split(',').map(part => {
    part = part.trim();
    if (!part.includes('-')) return part;

    // Split on dash: "T8o-T9o" → ["T8o", "T9o"]
    const [left, right] = part.split('-');

    // Only process if both sides look like hand notations (2-3 chars each)
    if (left.length < 2 || right.length < 2) return part;

    const leftRank = handRank(left);
    const rightRank = handRank(right);

    // If left < right, swap to descending order
    if (leftRank < rightRank) {
      return `${right}-${left}`;
    }

    return part;
  }).join(',');
}
