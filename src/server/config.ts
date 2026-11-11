import { randomBytes } from 'node:crypto';

export interface Config {
  env: 'development' | 'production' | 'test';
  port: number;
  host: string;
  publicUrl: string;
  allowedOrigins: string[];
  databaseUrl: string;
  sessionSecret: string;
  sessionDays: number;
  secureCookies: boolean;
  storageDir: string;
  clientDir: string;
  adminEmails: string[];
  livekit: { url: string; apiKey: string; apiSecret: string } | null;
  trustProxy: boolean;
  seedOnBoot: boolean;
  roomIdleMinutes: number;
  ipRateLimitScale: number;
}

function list(v: string | undefined): string[] {
  return (v ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

export function loadConfig(overrides: Partial<Config> = {}): Config {
  const env = (process.env.NODE_ENV as Config['env']) ?? 'development';
  const port = Number(process.env.PORT ?? 3000);
  // Render sets RENDER_EXTERNAL_URL automatically, so PUBLIC_URL is optional there
  const publicUrl = (process.env.PUBLIC_URL || process.env.RENDER_EXTERNAL_URL || `http://localhost:${port}`).replace(/\/$/, '');
  let sessionSecret = process.env.SESSION_SECRET ?? '';
  if (!sessionSecret) {
    if (env === 'production') throw new Error('SESSION_SECRET is required in production (32+ random bytes).');
    sessionSecret = randomBytes(32).toString('hex');
  }
  if (env === 'production' && sessionSecret.length < 32) throw new Error('SESSION_SECRET must be at least 32 characters.');
  const lkUrl = process.env.LIVEKIT_URL;
  const lkKey = process.env.LIVEKIT_API_KEY;
  const lkSecret = process.env.LIVEKIT_API_SECRET;
  const cfg: Config = {
    env,
    port,
    host: process.env.HOST ?? '0.0.0.0',
    publicUrl,
    allowedOrigins: [publicUrl, ...list(process.env.ALLOWED_ORIGINS)],
    databaseUrl: process.env.DATABASE_URL ?? 'pglite:./data/pglite',
    sessionSecret,
    sessionDays: Number(process.env.SESSION_DAYS ?? 30),
    secureCookies: publicUrl.startsWith('https://'),
    storageDir: process.env.STORAGE_DIR ?? './storage',
    clientDir: process.env.CLIENT_DIR ?? './dist/client',
    adminEmails: list(process.env.ADMIN_EMAILS).map((e) => e.toLowerCase()),
    livekit: lkUrl && lkKey && lkSecret ? { url: lkUrl, apiKey: lkKey, apiSecret: lkSecret } : null,
    trustProxy: process.env.TRUST_PROXY === 'true',
    seedOnBoot: process.env.SEED_ON_BOOT !== 'false',
    roomIdleMinutes: Number(process.env.ROOM_IDLE_MINUTES ?? 30),
    ipRateLimitScale: Math.max(1, Number(process.env.IP_RATE_LIMIT_SCALE ?? 1)),
    ...overrides,
  };
  return cfg;
}
