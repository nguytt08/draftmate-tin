import type { IDraftStrategy } from './IDraftStrategy';

export class LinearDraftStrategy implements IDraftStrategy {
  getMemberIndexForPick(pickNumber: number, memberCount: number): number {
    return ((pickNumber - 1) % memberCount);
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
