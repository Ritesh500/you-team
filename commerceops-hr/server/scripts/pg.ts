/**
 * Bundled PostgreSQL server for local development.
 *
 * Downloads nothing at runtime and requires no system-wide PostgreSQL install:
 * `embedded-postgres` ships real PostgreSQL 18 binaries per platform. The
 * cluster lives in `EMBEDDED_PG_DATA_DIR` and is persistent across restarts.
 *
 *   npm run db:start   # initialise (first run), start, stay in foreground
 *   npm run db:stop    # stop a cluster started by another process
 *   npm run db:status  # report whether the cluster is up
 *
 * If you already run PostgreSQL yourself, ignore all of this and just point
 * DATABASE_URL at your own instance.
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import EmbeddedPostgres from 'embedded-postgres';
import { env, SERVER_ROOT } from '../src/config/env.js';

/**
 * A live PostgreSQL cluster inside a cloud-synced folder is asking for trouble:
 * OneDrive/Dropbox will happily try to upload WAL segments mid-write and can
 * lock files out from under the postmaster. When the default relative data dir
 * would land in one, move the cluster to the home directory instead. Set an
 * absolute EMBEDDED_PG_DATA_DIR to override this entirely.
 */
function resolveDataDir(): string {
  if (path.isAbsolute(env.EMBEDDED_PG_DATA_DIR)) return env.EMBEDDED_PG_DATA_DIR;

  const inRepo = path.join(SERVER_ROOT, env.EMBEDDED_PG_DATA_DIR);
  const synced = /[\\/](OneDrive|Dropbox|Google Drive|iCloudDrive)([\\/]|$)/i.test(inRepo);

  if (!synced) return inRepo;

  const relocated = path.join(os.homedir(), '.commerceops-hr', 'pgdata');
  if (!process.env['COMMERCEOPS_PG_QUIET']) {
    console.log(
      `[postgres] project lives in a cloud-synced folder; keeping the cluster outside it at\n` +
        `[postgres]   ${relocated}\n` +
        `[postgres] (set EMBEDDED_PG_DATA_DIR to an absolute path to choose your own location)`,
    );
  }
  return relocated;
}

const dataDir = resolveDataDir();

const PID_FILE = path.join(dataDir, 'postmaster.pid');

function log(message: string): void {
  console.log(`[postgres] ${message}`);
}

function isInitialised(): boolean {
  return fs.existsSync(path.join(dataDir, 'PG_VERSION'));
}

function portIsOpen(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.connect({ host: '127.0.0.1', port });
    const finish = (open: boolean) => {
      socket.destroy();
      resolve(open);
    };
    socket.setTimeout(1500);
    socket.once('connect', () => finish(true));
    socket.once('timeout', () => finish(false));
    socket.once('error', () => finish(false));
  });
}

function createInstance(): EmbeddedPostgres {
  return new EmbeddedPostgres({
    databaseDir: dataDir,
    port: env.EMBEDDED_PG_PORT,
    user: env.EMBEDDED_PG_USER,
    password: env.EMBEDDED_PG_PASSWORD,
    authMethod: 'password',
    persistent: true,
    // Without this, initdb picks up the host locale's codepage (WIN1252 on this
    // machine) and the cluster cannot store `₹` or non-Latin-1 names at all.
    initdbFlags: ['--encoding=UTF8', '--locale=C'],
    onLog: (message) => {
      const trimmed = message.trim();
      if (trimmed) console.log(`[postgres] ${trimmed}`);
    },
    onError: (message) => {
      const text = message instanceof Error ? message.message : String(message);
      const trimmed = text.trim();
      // initdb and postgres both write ordinary progress output to stderr.
      if (trimmed) console.log(`[postgres] ${trimmed}`);
    },
  });
}

async function start(): Promise<void> {
  if (await portIsOpen(env.EMBEDDED_PG_PORT)) {
    log(`something is already listening on port ${env.EMBEDDED_PG_PORT} — assuming it is our cluster.`);
    log('Nothing to do. Keeping this process alive so `npm run dev` stays tidy; Ctrl+C to exit.');
    await new Promise(() => {});
    return;
  }

  const pg = createInstance();

  if (!isInitialised()) {
    log(`initialising a fresh cluster in ${dataDir} (first run only, takes a few seconds)…`);
    fs.mkdirSync(dataDir, { recursive: true });
    await pg.initialise();
  }

  log(`starting PostgreSQL on 127.0.0.1:${env.EMBEDDED_PG_PORT}…`);
  await pg.start();

  try {
    await pg.createDatabase(env.EMBEDDED_PG_DATABASE);
    log(`created database "${env.EMBEDDED_PG_DATABASE}".`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/already exists/i.test(message)) {
      log(`database "${env.EMBEDDED_PG_DATABASE}" already exists.`);
    } else {
      throw error;
    }
  }

  log('ready. Press Ctrl+C to stop.');

  let shuttingDown = false;
  const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    log(`received ${signal}, shutting down…`);
    try {
      await pg.stop();
    } catch (error) {
      console.error('[postgres] error during shutdown:', error);
    }
    process.exit(0);
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGHUP', () => void shutdown('SIGHUP'));

  // Hold the event loop open; the cluster runs as a detached child process.
  await new Promise(() => {});
}

/**
 * Resolve pg_ctl from the platform binary package embedded-postgres installed.
 * The specifier is built at runtime because only the current platform's package
 * is present in node_modules.
 */
async function resolvePgCtl(): Promise<string> {
  const platform = os.platform();
  const arch = os.arch();

  const suffix =
    platform === 'win32'
      ? 'windows-x64'
      : platform === 'darwin'
        ? `darwin-${arch}`
        : platform === 'linux'
          ? `linux-${arch}`
          : null;

  if (!suffix) {
    throw new Error(`embedded-postgres does not ship binaries for ${platform}/${arch}`);
  }

  const binaries = (await import(`@embedded-postgres/${suffix}`)) as { pg_ctl: string };
  return binaries.pg_ctl;
}

async function stop(): Promise<void> {
  if (!fs.existsSync(PID_FILE)) {
    log('no postmaster.pid found — cluster does not appear to be running.');
    return;
  }

  const pgCtl = await resolvePgCtl();
  log('stopping cluster via pg_ctl…');

  await new Promise<void>((resolve, reject) => {
    const child = spawn(pgCtl, ['stop', '-D', dataDir, '-m', 'fast', '-w'], {
      stdio: 'inherit',
    });
    child.once('error', reject);
    child.once('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`pg_ctl exited with code ${code}`));
    });
  });

  log('stopped.');
}

async function status(): Promise<void> {
  const open = await portIsOpen(env.EMBEDDED_PG_PORT);
  log(`data directory : ${dataDir}`);
  log(`initialised    : ${isInitialised() ? 'yes' : 'no'}`);
  log(`port ${env.EMBEDDED_PG_PORT}      : ${open ? 'accepting connections' : 'closed'}`);
  log(`database       : ${env.EMBEDDED_PG_DATABASE}`);
}

const command = process.argv[2] ?? 'start';

const commands: Record<string, () => Promise<void>> = { start, stop, status };
const run = commands[command];

if (!run) {
  console.error(`[postgres] unknown command "${command}". Use: start | stop | status`);
  process.exit(1);
}

run().catch((error) => {
  console.error('[postgres] failed:', error);
  process.exit(1);
});
