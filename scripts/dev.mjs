// Runs the API/realtime server (with --watch) and the Vite dev server together.
import { spawn } from 'node:child_process';

const env = { ...process.env, PUBLIC_URL: process.env.PUBLIC_URL ?? 'http://localhost:5173', DATABASE_URL: process.env.DATABASE_URL ?? 'pglite:./data/pglite' };
const procs = [
  spawn('node', ['--watch', 'src/server/index.ts'], { stdio: 'inherit', env }),
  spawn('npx', ['vite'], { stdio: 'inherit', env }),
];
const stop = () => {
  for (const p of procs) p.kill('SIGTERM');
  process.exit(0);
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
for (const p of procs) p.on('exit', (code) => code && stop());
