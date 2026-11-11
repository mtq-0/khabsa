/** Maintenance CLI: migrate | seed | make-admin <email> */
import { loadConfig } from '../config.ts';
import { createDb, migrate } from './db.ts';
import { seed } from './seed/seed.ts';
import { Storage } from '../storage/storage.ts';

const [cmd, arg] = process.argv.slice(2);
const config = loadConfig();
const db = await createDb(config.databaseUrl);
try {
  await migrate(db, console.log);
  if (cmd === 'seed') await seed(db, new Storage(config.storageDir), console.log);
  else if (cmd === 'make-admin') {
    if (!arg) throw new Error('usage: npm run make-admin -- someone@example.com');
    const r = await db.query(`update users set role = 'admin' where lower(email) = lower($1) and not is_guest`, [arg]);
    console.log(r.rowCount ? `${arg} is now an admin` : `no registered user with email ${arg}`);
  } else if (cmd !== 'migrate') throw new Error(`unknown command ${cmd}`);
} finally {
  await db.close();
}
