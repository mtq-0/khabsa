import { loadConfig } from './config.ts';
import { buildApp } from './app.ts';

const config = loadConfig();
const built = await buildApp(config, { log: config.env !== 'test' });
await built.app.listen({ port: config.port, host: config.host });
console.log(`[khabsa] listening on ${config.host}:${config.port} — public URL ${config.publicUrl}`);
if (!config.livekit) console.log('[khabsa] voice chat disabled: set LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET to enable it');

let closing = false;
for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, async () => {
    if (closing) return;
    closing = true;
    console.log(`[khabsa] ${sig} received, shutting down`);
    const t = setTimeout(() => process.exit(1), 10_000);
    try {
      await built.close();
    } finally {
      clearTimeout(t);
      process.exit(0);
    }
  });
}
