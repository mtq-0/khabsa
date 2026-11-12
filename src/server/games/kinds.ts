import type { ContentKind } from './types.ts';

/** Which content kind each game draws from. Pure module (no Node APIs). */
export const KIND_FOR_GAME: Record<string, ContentKind> = {
  'outsider-word': 'word',
  'odd-question': 'question-pair',
  'outsider-picture': 'picture-pair',
  'most-likely': 'most-likely',
  taboo: 'taboo-card',
  'speed-quiz': 'trivia',
  'draw-guess': 'draw-word',
  'outsider-draw': 'draw-word',
};
