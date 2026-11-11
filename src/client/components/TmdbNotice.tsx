import { asset } from '../lib/mode.ts';

/** Attribution required by the TMDB API terms (logo + notice). */
export function TmdbNotice() {
  return (
    <p className="flex flex-wrap items-center justify-center gap-2 text-xs text-ink-500" dir="ltr">
      <a href="https://www.themoviedb.org" target="_blank" rel="noopener noreferrer" aria-label="The Movie Database (TMDB)">
        <img src={asset('tmdb-logo.svg')} alt="TMDB" className="h-3" />
      </a>
      This product uses the TMDB API but is not endorsed or certified by TMDB.
    </p>
  );
}
