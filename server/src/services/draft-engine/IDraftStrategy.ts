export interface IDraftStrategy {
  /** Returns the 0-based index into a sorted members array for a given 1-based pick number */
  getMemberIndexForPick(pickNumber: number, memberCount: number): number;
  getRoundForPick(pickNumber: number, memberCount: number): number;
  getPositionInRound(pickNumber: number, memberCount: number): number;
  getTotalPicks(totalRounds: number, memberCount: number): number;
  isComplete(currentPickNumber: number, totalRounds: number, memberCount: number): boolean;
}
