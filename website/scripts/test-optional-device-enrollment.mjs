// Run real PostgreSQL semantics in an isolated, in-memory WASM database.
// Never loads .env or production credentials.
import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
async function expand(file) {
  const lines = (await readFile(file, 'utf8')).split(/\r?\n/), result = [];
  for (const line of lines) {
    if (line.startsWith('\\ir ')) result.push(await expand(resolve(dirname(file), line.slice(4).trim())));
    else if (!line.startsWith('\\set ')) result.push(line);
  }
  return result.join('\n');
}
for (const test of ['recoveryPolicy', 'optionalDeviceEnrollment']) {
  const db = new PGlite();
  try { await db.exec(await expand(resolve(`tests/sql/${test}.sql`))); console.log(`PASS ${test}: isolated PostgreSQL role, trigger and RPC checks`); }
  finally { await db.close(); }
}
