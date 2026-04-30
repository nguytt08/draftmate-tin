import { describe, it, expect } from 'vitest';
import { SnakeDraftStrategy } from './SnakeDraftStrategy';

describe('SnakeDraftStrategy', () => {
  const strategy = new SnakeDraftStrategy();

  describe('getMemberIndexForPick — 3 members', () => {
    const N = 3;
    // Round 1 (picks 1-3): 0, 1, 2
    // Round 2 (picks 4-6): 2, 1, 0
    // Round 3 (picks 7-9): 0, 1, 2
    const expected = [0, 1, 2, 2, 1, 0, 0, 1, 2];

    it.each(expected.map((memberIdx, i) => [i + 1, memberIdx]))(
      'pick %i → member index %i',
      (pickNumber, memberIdx) => {
        expect(strategy.getMemberIndexForPick(pickNumber, N)).toBe(memberIdx);
      },
    );
  });

  describe('getMemberIndexForPick — 4 members', () => {
    const N = 4;
    // Round 1: 0,1,2,3  Round 2: 3,2,1,0  Round 3: 0,1,2,3
    const expected = [0, 1, 2, 3, 3, 2, 1, 0, 0, 1, 2, 3];

    it.each(expected.map((memberIdx, i) => [i + 1, memberIdx]))(
      'pick %i → member index %i',
      (pickNumber, memberIdx) => {
        expect(strategy.getMemberIndexForPick(pickNumber, N)).toBe(memberIdx);
      },
    );
  });

  it('getRoundForPick', () => {
    expect(strategy.getRoundForPick(1, 3)).toBe(1);
    expect(strategy.getRoundForPick(3, 3)).toBe(1);
    expect(strategy.getRoundForPick(4, 3)).toBe(2);
    expect(strategy.getRoundForPick(6, 3)).toBe(2);
    expect(strategy.getRoundForPick(7, 3)).toBe(3);
  });

  it('getPositionInRound', () => {
    expect(strategy.getPositionInRound(1, 3)).toBe(1);
    expect(strategy.getPositionInRound(3, 3)).toBe(3);
    expect(strategy.getPositionInRound(4, 3)).toBe(1);
    expect(strategy.getPositionInRound(5, 3)).toBe(2);
  });

  it('getTotalPicks', () => {
    expect(strategy.getTotalPicks(3, 4)).toBe(12);
    expect(strategy.getTotalPicks(2, 3)).toBe(6);
  });

  it('isComplete', () => {
    expect(strategy.isComplete(6, 2, 3)).toBe(false);
    expect(strategy.isComplete(7, 2, 3)).toBe(true);
  });
});
