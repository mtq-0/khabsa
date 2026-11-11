import type { GameId } from '../../shared/games.ts';
import { createDrawGuessEngine } from './drawGuess.ts';
import { createMostLikelyEngine } from './mostLikely.ts';
import { createOddQuestionEngine } from './oddQuestion.ts';
import { createOutsiderEngine } from './outsider.ts';
import { createSpeedQuizEngine } from './speedQuiz.ts';
import { createTabooEngine } from './taboo.ts';
import type { GameEngine, ImageAccess } from './types.ts';

export type EngineRegistry = Record<GameId, GameEngine<any>>;

export function createEngines(images: ImageAccess): EngineRegistry {
  return {
    'outsider-word': createOutsiderEngine('word'),
    'odd-question': createOddQuestionEngine(),
    'outsider-picture': createOutsiderEngine('picture', images),
    'most-likely': createMostLikelyEngine(),
    taboo: createTabooEngine(),
    'speed-quiz': createSpeedQuizEngine(),
    'draw-guess': createDrawGuessEngine(),
  };
}
