/**
 * TMDB (The Movie Database) poster lookup for cartoon / movie / TV words.
 * - The admin searches and approves matches; only the poster path is stored.
 * - Posters are fetched server-side and served to players through the same
 *   viewer-bound signed image route as other secret pictures, so the outsider
 *   never receives them and TMDB URLs are not exposed to players.
 * - Free for non-commercial use with attribution (logo + notice in the footer).
 * Configure with TMDB_TOKEN (v4 "API Read Access Token") or a v3 API key.
 */
import { AppError } from '../../shared/errors.ts';

export interface TmdbMatch {
  tmdbId: number;
  type: 'movie' | 'tv';
  title: string;
  originalTitle: string;
  year: string | null;
  posterPath: string;
}

export const POSTER_PATH_RE = /^\/[A-Za-z0-9_-]{5,64}\.(jpg|jpeg|png|webp)$/;
const SIZES = new Set(['w185', 'w342', 'w500']);

export class TmdbService {
  private token: string | null;
  private apiBase: string;
  private imageBase: string;
  private cache = new Map<string, { data: Buffer; mime: string }>();
  private cacheBytes = 0;

  constructor(cfg: { token: string | null; apiBase: string; imageBase: string }) {
    this.token = cfg.token;
    this.apiBase = cfg.apiBase.replace(/\/$/, '');
    this.imageBase = cfg.imageBase.replace(/\/$/, '');
  }

  get configured() {
    return !!this.token;
  }

  private async get<T>(path: string, params: Record<string, string>): Promise<T> {
    if (!this.token) throw new AppError('VALIDATION', 'TMDB مش مفعّل: حط TMDB_TOKEN بإعدادات السيرفر.');
    const url = new URL(this.apiBase + path);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    const headers: Record<string, string> = { accept: 'application/json' };
    // v4 read-access tokens are JWTs; anything else is treated as a v3 api key
    if (this.token.startsWith('eyJ')) headers.authorization = `Bearer ${this.token}`;
    else url.searchParams.set('api_key', this.token);
    const res = await fetch(url, { headers, signal: AbortSignal.timeout(10_000) }).catch(() => null);
    if (!res) throw new AppError('SERVER_ERROR', 'ما قدرنا نوصل لـ TMDB.');
    if (res.status === 401) throw new AppError('FORBIDDEN', 'مفتاح TMDB غلط.');
    if (res.status === 429) throw new AppError('RATE_LIMITED', 'TMDB طلب نستنى شوي.');
    if (!res.ok) throw new AppError('SERVER_ERROR', `TMDB رجّع ${res.status}.`);
    return (await res.json()) as T;
  }

  /** Best movie/TV match with a poster for a (usually Arabic) title. */
  async search(query: string): Promise<TmdbMatch | null> {
    type R = { media_type?: string; id: number; title?: string; name?: string; original_title?: string; original_name?: string; release_date?: string; first_air_date?: string; poster_path?: string | null; popularity?: number };
    const res = await this.get<{ results: R[] }>('/search/multi', { query, language: 'ar', include_adult: 'false', page: '1' });
    const hit = (res.results ?? []).find((r) => (r.media_type === 'movie' || r.media_type === 'tv') && r.poster_path && POSTER_PATH_RE.test(r.poster_path));
    if (!hit) return null;
    const date = hit.release_date || hit.first_air_date || '';
    return {
      tmdbId: hit.id,
      type: hit.media_type as 'movie' | 'tv',
      title: hit.title ?? hit.name ?? '',
      originalTitle: hit.original_title ?? hit.original_name ?? '',
      year: date ? date.slice(0, 4) : null,
      posterPath: hit.poster_path!,
    };
  }

  /** Fetch a poster from the TMDB CDN (small in-memory cache, nothing stored on disk). */
  async poster(path: string, size = 'w500'): Promise<{ data: Buffer; mime: string }> {
    if (!POSTER_PATH_RE.test(path) || !SIZES.has(size)) throw new AppError('VALIDATION');
    const key = size + path;
    const hit = this.cache.get(key);
    if (hit) return hit;
    const res = await fetch(`${this.imageBase}/${size}${path}`, { signal: AbortSignal.timeout(15_000) }).catch(() => null);
    if (!res || !res.ok) throw new AppError('NOT_FOUND', 'الصورة مش متوفرة من TMDB.');
    const mime = res.headers.get('content-type') ?? 'image/jpeg';
    if (!/^image\/(jpeg|png|webp)$/.test(mime.split(';')[0])) throw new AppError('NOT_FOUND');
    const data = Buffer.from(await res.arrayBuffer());
    if (data.length > 3 * 1024 * 1024) throw new AppError('NOT_FOUND');
    const entry = { data, mime: mime.split(';')[0] };
    this.cache.set(key, entry);
    this.cacheBytes += data.length;
    while (this.cacheBytes > 24 * 1024 * 1024) {
      const [k, v] = this.cache.entries().next().value!;
      this.cache.delete(k);
      this.cacheBytes -= v.data.length;
    }
    return entry;
  }
}
