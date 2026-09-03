#!/usr/bin/env node
/**
 * The migrations, against a real Postgres.
 *
 * RLS is the security model for this app — `docs/BACKEND.md` says so, and the
 * publishable key in the bundle is public precisely because the policies are
 * what stands between a crewmate and your season. Until this existed there was
 * no way to run a single one of them: they were written, reviewed by reading,
 * and applied by hand to the one database that matters.
 *
 * So: stand up a throwaway server, give it the parts of Supabase the
 * migrations are written to stand on (`supabase/tests/shim.sql` — an
 * `auth.users`, an `auth.uid()`, the three roles, and the default grants),
 * apply every migration in order, and then run `supabase/tests/policies.sql`,
 * which asserts what each policy is supposed to stop. A wrong answer raises
 * and the run fails.
 *
 * Opt-in, like the browser checks, because it needs a Postgres:
 *
 *   apt-get install -y postgresql-16     # or the distribution's equivalent
 *   npm run verify:sql
 *
 * It also proves the thing anybody pasting SQL into a dashboard wants to know:
 * that running it twice changes nothing the second time.
 */

import { execFileSync, spawnSync } from 'node:child_process';
import { chownSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const MIGRATIONS = 'supabase/migrations';
const SHIM = 'supabase/tests/shim.sql';
const POLICIES = 'supabase/tests/policies.sql';
const PORT = process.env.PGPORT ?? '54329';

/** Where the server's binaries are, whatever the distribution called them. */
function findBin() {
  const guesses = [
    process.env.PG_BIN,
    ...readdirSync('/usr/lib/postgresql', { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      // Newest major first.
      .sort((a, b) => Number(b.name) - Number(a.name))
      .map((entry) => `/usr/lib/postgresql/${entry.name}/bin`),
  ].filter(Boolean);

  for (const dir of guesses) {
    const probe = spawnSync(join(dir, 'initdb'), ['--version'], { encoding: 'utf8' });
    if (probe.status === 0) return dir;
  }
  return null;
}

let bin;
try {
  bin = findBin();
} catch {
  bin = null;
}

if (!bin) {
  console.error(
    'No Postgres found. This check needs a server to run the migrations against:\n' +
      '  apt-get install -y postgresql-16\n' +
      'or set PG_BIN to the directory holding initdb and pg_ctl.',
  );
  process.exit(1);
}

const data = mkdtempSync(join(tmpdir(), 'lane-log-pg-'));
const socket = mkdtempSync(join(tmpdir(), 'lane-log-sock-'));
let running = false;

/**
 * Postgres refuses to run as root, and CI images very often are.
 *
 * So when this is root, everything is handed to the `postgres` account with
 * `runuser` and the two temporary directories are given to it — rather than
 * telling somebody their container is the wrong shape for a test.
 */
const AS_POSTGRES = typeof process.getuid === 'function' && process.getuid() === 0;

if (AS_POSTGRES) {
  const { uid, gid } = (() => {
    const line = execFileSync('id', ['-u', 'postgres'], { encoding: 'utf8' }).trim();
    const group = execFileSync('id', ['-g', 'postgres'], { encoding: 'utf8' }).trim();
    return { uid: Number(line), gid: Number(group) };
  })();
  chownSync(data, uid, gid);
  chownSync(socket, uid, gid);
}

function run(command, args, options = {}) {
  const [file, argv] = AS_POSTGRES
    ? ['runuser', ['-u', 'postgres', '--', join(bin, command), ...args]]
    : [join(bin, command), args];
  return execFileSync(file, argv, { encoding: 'utf8', ...options });
}

/** Everything runs in a cluster that lives for one invocation and is deleted. */
function pg(command, args, options = {}) {
  return run(command, args, options);
}

function psql(args, { quiet = true } = {}) {
  return run(
    'psql',
    ['-h', socket, '-p', PORT, '-U', 'postgres', '-v', 'ON_ERROR_STOP=1', ...(quiet ? ['-q'] : []), ...args],
    { stdio: ['ignore', 'pipe', 'pipe'] },
  );
}

/** The same, keeping stderr — which is where `raise notice` writes. */
function psqlBothStreams(args) {
  const argv = ['-h', socket, '-p', PORT, '-U', 'postgres', '-v', 'ON_ERROR_STOP=1', ...args];
  const [file, full] = AS_POSTGRES
    ? ['runuser', ['-u', 'postgres', '--', join(bin, 'psql'), ...argv]]
    : [join(bin, 'psql'), argv];

  const result = spawnSync(file, full, { encoding: 'utf8' });
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`;
  if (result.status !== 0) throw new Error(output);
  return output;
}

function stop() {
  if (running) {
    try {
      pg('pg_ctl', ['-D', data, '-m', 'immediate', 'stop'], { stdio: 'ignore' });
    } catch {
      // Going away anyway.
    }
    running = false;
  }
  rmSync(data, { recursive: true, force: true });
  rmSync(socket, { recursive: true, force: true });
}

process.on('exit', stop);

try {
  pg('initdb', ['-D', data, '-A', 'trust', '-U', 'postgres'], { stdio: 'ignore' });
  pg('pg_ctl', ['-D', data, '-o', `-k ${socket} -p ${PORT} -c listen_addresses=`, '-w', 'start'], {
    stdio: 'ignore',
  });
  running = true;

  const files = readdirSync(MIGRATIONS)
    .filter((name) => name.endsWith('.sql'))
    .sort();

  const apply = (label) => {
    psql(['-d', 'lanelog', '-f', SHIM]);
    for (const name of files) psql(['-d', 'lanelog', '-f', join(MIGRATIONS, name)]);
    console.log(`ok    ${label}: ${files.length} migrations applied`);
  };

  psql(['-d', 'postgres', '-c', 'create database lanelog']);
  apply('first run');

  // The claim on the tin of anything pasted into a dashboard.
  apply('second run, unchanged');

  // Assertions run against a database built once, not twice, so a policy that
  // only survives a re-run cannot pass by accident.
  psql(['-d', 'postgres', '-c', 'drop database lanelog']);
  psql(['-d', 'postgres', '-c', 'create database lanelog']);
  psql(['-d', 'lanelog', '-f', SHIM]);
  for (const name of files) psql(['-d', 'lanelog', '-f', join(MIGRATIONS, name)]);

  // `raise notice` goes to stderr, so both streams are read. The first version
  // of this read stdout only, found nothing, and printed "0 policy checks
  // passed" — then exited 0. A check runner that reports nothing and calls it
  // success is worse than no check runner, which is what the count below is
  // for.
  const output = psqlBothStreams(['-d', 'lanelog', '-f', POLICIES]);
  const checks = output
    .split('\n')
    .filter((line) => line.includes('NOTICE:  ok'))
    .map((line) => line.slice(line.indexOf('NOTICE:  ') + 'NOTICE:  '.length));

  for (const line of checks) console.log(line);

  if (checks.length === 0) {
    throw new Error(
      `The policy checks produced no results at all. Something ran but asserted nothing:\n${output}`,
    );
  }

  console.log(`\n${checks.length} policy checks passed.`);
} catch (error) {
  const detail = error.stderr ?? error.message;
  console.error(`\nFAILED\n${detail}`);
  process.exitCode = 1;
} finally {
  stop();
}
