import type { IDraftStrategy } from './IDraftStrategy';

export class SnakeDraftStrategy implements IDraftStrategy {
  getMemberIndexForPick(pickNumber: number, memberCount: number): number {
    const pickIndex = pickNumber - 1;
    const round = Math.floor(pickIndex / memberCount);
    const positionInRound = pickIndex % memberCount;
    return round % 2 === 0 ? positionInRound : memberCount - 1 - positionInRound;
  }

  getRoundForPick(pickNumber: number, memberCount: number): number {
    return Math.floor((pickNumber - 1) / memberCount) + 1;
  }

  getPositionInRound(pickNumber: number, memberCount: number): number {
    return ((pickNumber - 1) % memberCount) + 1;
  }

  getTotalPicks(totalRounds: number, memberCount: number): number {
    return totalRounds * memberCount;
  }

  isComplete(currentPickNumber: number, totalRounds: number, memberCount: number): boolean {
    return currentPickNumber > this.getTotalPicks(totalRounds, memberCount);
  }
}
