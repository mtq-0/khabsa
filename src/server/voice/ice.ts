/**
 * TURN relays for the peer-to-peer voice mesh. Direct connections between two phones fail on
 * many mobile-data networks (carrier-grade NAT); a TURN relay fixes that. All of these are
 * optional (the voice mesh also has its own fallback through this server):
 *  - Cloudflare Realtime TURN (free tier 1000 GB/month): CLOUDFLARE_TURN_KEY_ID + CLOUDFLARE_TURN_KEY_API_TOKEN
 *    The key stays on the server; browsers only get short-lived credentials.
 *  - Metered / Open Relay: METERED_DOMAIN (yourapp.metered.live) + METERED_API_KEY
 *  - any TURN server: TURN_URLS (comma separated) + TURN_USERNAME + TURN_CREDENTIAL
 */
export interface IceConfig {
  cloudflare: { keyId: string; token: string } | null;
  metered: { domain: string; apiKey: string } | null;
  turn: { urls: string[]; username: string; credential: string } | null;
}

export interface IceServer {
  urls: string | string[];
  username?: string;
  credential?: string;
}

const list = (v: string | undefined) => (v ?? '').split(',').map((s) => s.trim()).filter(Boolean);

export function iceConfigFromEnv(env: NodeJS.ProcessEnv = process.env): IceConfig {
  const cfId = env.CLOUDFLARE_TURN_KEY_ID?.trim();
  const cfToken = env.CLOUDFLARE_TURN_KEY_API_TOKEN?.trim();
  const mDomain = env.METERED_DOMAIN?.trim().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  const mKey = env.METERED_API_KEY?.trim();
  const urls = list(env.TURN_URLS).filter((u) => /^turns?:/.test(u));
  return {
    cloudflare: cfId && cfToken ? { keyId: cfId, token: cfToken } : null,
    metered: mDomain && mKey && /^[a-z0-9.-]+$/i.test(mDomain) ? { domain: mDomain, apiKey: mKey } : null,
    turn: urls.length && env.TURN_USERNAME && env.TURN_CREDENTIAL ? { urls, username: env.TURN_USERNAME, credential: env.TURN_CREDENTIAL } : null,
  };
}

/** keeps only well-formed entries, and drops port 53 (blocked by browsers, only causes timeouts) */
export function cleanIceServers(raw: unknown): IceServer[] {
  if (!Array.isArray(raw)) return [];
  const out: IceServer[] = [];
  for (const s of raw.slice(0, 10)) {
    if (!s || typeof s !== 'object') continue;
    const r = s as Record<string, unknown>;
    const urls = (Array.isArray(r.urls) ? r.urls : [r.urls]).filter((u): u is string => typeof u === 'string' && /^(stuns?|turns?):[^\s]{3,200}$/.test(u) && !/:53(\?|$)/.test(u));
    if (!urls.length) continue;
    const entry: IceServer = { urls };
    if (typeof r.username === 'string' && r.username.length <= 512) entry.username = r.username;
    if (typeof r.credential === 'string' && r.credential.length <= 512) entry.credential = r.credential;
    out.push(entry);
  }
  return out;
}

export class IceService {
  private cfg: IceConfig;
  private cache: { at: number; servers: IceServer[] } | null = null;
  private inflight: Promise<IceServer[]> | null = null;
  private fetchImpl: typeof fetch;
  constructor(cfg: IceConfig, fetchImpl: typeof fetch = fetch) {
    this.cfg = cfg;
    this.fetchImpl = fetchImpl;
  }

  get configured() {
    return !!(this.cfg.cloudflare || this.cfg.metered || this.cfg.turn);
  }

  /** TURN servers for browsers (cached for an hour; Cloudflare credentials live 24 h). Never throws. */
  async servers(now = Date.now()): Promise<IceServer[]> {
    if (!this.configured) return [];
    if (this.cache && now - this.cache.at < 60 * 60_000) return this.cache.servers;
    this.inflight ??= this.load()
      .then((servers) => {
        // a failed lookup is retried after a minute, a good one is kept for an hour
        this.cache = { at: servers.length ? now : now - 59 * 60_000, servers };
        return servers;
      })
      .finally(() => {
        this.inflight = null;
      });
    return this.inflight;
  }

  private async load(): Promise<IceServer[]> {
    const out: IceServer[] = [];
    if (this.cfg.turn) out.push({ urls: this.cfg.turn.urls, username: this.cfg.turn.username, credential: this.cfg.turn.credential });
    if (this.cfg.cloudflare) {
      try {
        const res = await this.fetchImpl(`https://rtc.live.cloudflare.com/v1/turn/keys/${encodeURIComponent(this.cfg.cloudflare.keyId)}/credentials/generate-ice-servers`, {
          method: 'POST',
          headers: { authorization: `Bearer ${this.cfg.cloudflare.token}`, 'content-type': 'application/json' },
          body: JSON.stringify({ ttl: 86_400 }),
          signal: AbortSignal.timeout(8000),
        });
        if (res.ok) out.push(...cleanIceServers(((await res.json()) as { iceServers?: unknown }).iceServers));
        else console.warn('[voice] Cloudflare TURN credentials failed', res.status);
      } catch (e) {
        console.warn('[voice] Cloudflare TURN unreachable', (e as Error).message);
      }
    }
    if (this.cfg.metered) {
      try {
        const res = await this.fetchImpl(`https://${this.cfg.metered.domain}/api/v1/turn/credentials?apiKey=${encodeURIComponent(this.cfg.metered.apiKey)}`, { signal: AbortSignal.timeout(8000) });
        if (res.ok) out.push(...cleanIceServers(await res.json()));
        else console.warn('[voice] Metered TURN credentials failed', res.status);
      } catch (e) {
        console.warn('[voice] Metered TURN unreachable', (e as Error).message);
      }
    }
    return out;
  }
}
