import { SnakeDraftStrategy } from './SnakeDraftStrategy';
import { LinearDraftStrategy } from './LinearDraftStrategy';
import type { IDraftStrategy } from './IDraftStrategy';

export function createDraftStrategy(format: string): IDraftStrategy {
  switch (format) {
    case 'SNAKE':
      return new SnakeDraftStrategy();
    case 'LINEAR':
      return new LinearDraftStrategy();
    default:
      throw new Error(`Unsupported draft format: ${format}`);
  }
}
