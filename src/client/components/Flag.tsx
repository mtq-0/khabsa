/** Country flags for the country words (images, so they also show on Windows, which has no flag emoji). */
import { flagEmoji, flagOf } from '../../shared/flags.ts';
import { asset } from '../lib/mode.ts';
import { cx } from './ui.tsx';

export function Flag({ word, className }: { word: string | null | undefined; className?: string }) {
  const code = flagOf(word);
  if (!code) return null;
  return (
    <img
      src={asset(`flags/${code}.svg`)}
      alt={flagEmoji(code)}
      aria-hidden
      draggable={false}
      loading="lazy"
      className={cx('inline-block h-[0.9em] w-auto rounded-[2px] align-[-0.08em] shadow-sm', className)}
      data-testid="flag"
    />
  );
}

/** "🇯🇴 الأردن": the word with its flag in front (just the word when it is not a country) */
export function WithFlag({ word, className }: { word: string | null | undefined; className?: string }) {
  if (!word) return null;
  return (
    <>
      <Flag word={word} className={cx('me-[0.3em]', className)} />
      {word}
    </>
  );
}
