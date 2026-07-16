#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';

import Database from 'better-sqlite3';

const MANAGED_BACKUP_COMPONENTS = [
  'config',
  'groups',
  'sessions',
  'skills',
  'mcp-servers',
  'plugins',
  'memory',
  'avatars',
  'extra',
  'builtin-skills',
  'db',
];

function usage() {
  console.error(
    'Usage:\n' +
      '  node scripts/restore-backup.mjs assert-port-free <port>\n' +
      '  node scripts/restore-backup.mjs restore <archive.tar.gz> <data-dir> <port>',
  );
  process.exit(2);
}

function parsePort(raw) {
  const port = Number(raw);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error(`Invalid service port: ${raw}`);
  }
  return port;
}

function canConnect(host, port) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host, port });
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(value);
    };
    socket.setTimeout(500, () => finish(false));
    socket.once('connect', () => finish(true));
    socket.once('error', () => finish(false));
  });
}

async function assertPortFree(port) {
  const listening =
    (await canConnect('127.0.0.1', port)) || (await canConnect('::1', port));
  if (listening) {
    throw new Error(
      `Refusing to restore while a service is listening on port ${port}. Stop HappyClaw first (make stop).`,
    );
  }
}

function runTar(args, errorPrefix) {
  const result = spawnSync('tar', args, { encoding: 'utf8' });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(
      `${errorPrefix}: ${(result.stderr || result.stdout || 'tar failed').trim()}`,
    );
  }
  return result.stdout;
}

function validateArchiveEntries(archivePath) {
  const listing = runTar(
    ['-tzf', archivePath],
    'Unable to read backup archive',
  );
  const verboseListing = runTar(
    ['-tvzf', archivePath],
    'Unable to inspect backup archive types',
  );
  const entries = listing.split('\n').filter(Boolean);
  const entryTypes = verboseListing.split('\n').filter(Boolean);
  if (entries.length === 0) throw new Error('Backup archive is empty');
  if (entryTypes.length !== entries.length) {
    throw new Error('Unable to validate every backup archive entry');
  }
  for (const line of entryTypes) {
    // Tar verbose listings start with the entry type from the mode string.
    // Backups only need regular files and directories. Reject links, devices,
    // FIFOs and any future special type before extraction so an archive cannot
    // redirect writes outside the staging directory.
    if (line[0] !== '-' && line[0] !== 'd') {
      throw new Error(`Unsafe backup archive entry type: ${line[0] || '?'}`);
    }
  }
  for (const entry of entries) {
    const normalized = entry.replace(/\\/g, '/').replace(/\/$/, '');
    const segments = normalized.split('/');
    if (
      normalized.startsWith('/') ||
      segments.includes('..') ||
      (normalized !== 'data' && !normalized.startsWith('data/'))
    ) {
      throw new Error(`Unsafe backup archive entry: ${entry}`);
    }
  }
}

function validateExtractedTree(rootDir) {
  const pending = [rootDir];
  while (pending.length > 0) {
    const current = pending.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const candidate = path.join(current, entry.name);
      const stat = fs.lstatSync(candidate);
      if (stat.isSymbolicLink() || (!stat.isFile() && !stat.isDirectory())) {
        throw new Error(`Unsafe extracted backup entry: ${candidate}`);
      }
      if (stat.isDirectory()) pending.push(candidate);
    }
  }
}

function hardenSensitivePermissions(stagedDataDir) {
  for (const component of ['config', 'sessions', 'db']) {
    const rootDir = path.join(stagedDataDir, component);
    if (!fs.existsSync(rootDir)) continue;
    const pending = [rootDir];
    while (pending.length > 0) {
      const current = pending.pop();
      fs.chmodSync(current, 0o700);
      for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
        const candidate = path.join(current, entry.name);
        if (entry.isDirectory()) {
          pending.push(candidate);
        } else {
          fs.chmodSync(candidate, 0o600);
        }
      }
    }
  }
}

function validateDatabase(dbPath) {
  const probe = new Database(dbPath, { readonly: true, fileMustExist: true });
  try {
    const result = probe.pragma('integrity_check', { simple: true });
    if (result !== 'ok') {
      throw new Error(
        `Restored SQLite integrity_check failed: ${String(result)}`,
      );
    }
  } finally {
    probe.close();
  }
}

function readBackupManifest(stagedDataDir) {
  const manifestPath = path.join(stagedDataDir, 'backup-manifest.json');
  if (!fs.existsSync(manifestPath)) {
    // Backups created before format v2 were partial. Preserve their historical
    // behavior instead of deleting components they never knew how to capture.
    return {
      authoritative: false,
      managedComponents: MANAGED_BACKUP_COMPONENTS,
      presentComponents: MANAGED_BACKUP_COMPONENTS.filter((component) =>
        fs.existsSync(path.join(stagedDataDir, component)),
      ),
    };
  }
  const parsed = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  if (
    parsed?.formatVersion !== 2 ||
    !Array.isArray(parsed.managedComponents) ||
    !Array.isArray(parsed.presentComponents)
  ) {
    throw new Error('Unsupported or malformed backup manifest');
  }
  const allowed = new Set(MANAGED_BACKUP_COMPONENTS);
  const managedComponents = [...new Set(parsed.managedComponents)];
  const presentComponents = [...new Set(parsed.presentComponents)];
  if (
    managedComponents.length !== MANAGED_BACKUP_COMPONENTS.length ||
    managedComponents.some(
      (value) => typeof value !== 'string' || !allowed.has(value),
    ) ||
    presentComponents.some(
      (value) =>
        typeof value !== 'string' || !managedComponents.includes(value),
    ) ||
    !presentComponents.includes('db')
  ) {
    throw new Error('Backup manifest contains invalid components');
  }
  for (const component of presentComponents) {
    if (
      !fs
        .statSync(path.join(stagedDataDir, component), {
          throwIfNoEntry: false,
        })
        ?.isDirectory()
    ) {
      throw new Error(`Backup manifest component is missing: ${component}`);
    }
  }
  return { authoritative: true, managedComponents, presentComponents };
}

function replaceComponents(stagedDataDir, dataDir, stageRoot, manifest) {
  const rollbackDir = path.join(stageRoot, 'rollback');
  fs.mkdirSync(dataDir, { recursive: true });
  fs.mkdirSync(rollbackDir, { recursive: true });

  const replaced = [];
  try {
    for (const component of manifest.managedComponents) {
      const source = path.join(stagedDataDir, component);
      const hasSource = manifest.presentComponents.includes(component);
      if (!hasSource && !manifest.authoritative) continue;

      const destination = path.join(dataDir, component);
      const previous = path.join(rollbackDir, component);
      const hadPrevious = fs.existsSync(destination);
      if (hadPrevious) fs.renameSync(destination, previous);
      if (hasSource) {
        try {
          fs.renameSync(source, destination);
        } catch (error) {
          if (hadPrevious && fs.existsSync(previous)) {
            fs.renameSync(previous, destination);
          }
          throw error;
        }
      }
      replaced.push({
        destination,
        previous,
        hadPrevious,
        installed: hasSource,
      });
    }
  } catch (error) {
    for (const item of replaced.reverse()) {
      if (item.installed) {
        fs.rmSync(item.destination, { recursive: true, force: true });
      }
      if (item.hadPrevious && fs.existsSync(item.previous)) {
        fs.renameSync(item.previous, item.destination);
      }
    }
    throw error;
  }
}

async function restore(archiveArg, dataDirArg, port) {
  // Check immediately before any filesystem mutation as well as in Makefile's
  // early preflight, closing the prompt-to-restore race window.
  await assertPortFree(port);

  const archivePath = path.resolve(archiveArg);
  const dataDir = path.resolve(dataDirArg);
  if (!fs.statSync(archivePath, { throwIfNoEntry: false })?.isFile()) {
    throw new Error(`Backup archive does not exist: ${archivePath}`);
  }
  validateArchiveEntries(archivePath);

  const parentDir = path.dirname(dataDir);
  fs.mkdirSync(parentDir, { recursive: true });
  const stageRoot = fs.mkdtempSync(path.join(parentDir, '.happyclaw-restore-'));
  try {
    runTar(
      [
        '-xzf',
        archivePath,
        '-C',
        stageRoot,
        '--no-same-owner',
        '--no-same-permissions',
      ],
      'Unable to extract backup archive',
    );
    validateExtractedTree(stageRoot);
    const stagedDataDir = path.join(stageRoot, 'data');
    const manifest = readBackupManifest(stagedDataDir);
    hardenSensitivePermissions(stagedDataDir);
    const stagedDbDir = path.join(stagedDataDir, 'db');
    const stagedDbPath = path.join(stagedDbDir, 'messages.db');
    if (!fs.statSync(stagedDbPath, { throwIfNoEntry: false })?.isFile()) {
      throw new Error('Backup archive is missing data/db/messages.db');
    }

    // A database snapshot is self-contained. Never carry stale sidecars from
    // current data or a legacy archive into the restored database.
    fs.rmSync(`${stagedDbPath}-wal`, { force: true });
    fs.rmSync(`${stagedDbPath}-shm`, { force: true });
    validateDatabase(stagedDbPath);
    // integrity_check may create empty WAL/SHM sidecars because the snapshot
    // retains WAL journal mode. They are not part of the restored state.
    fs.rmSync(`${stagedDbPath}-wal`, { force: true });
    fs.rmSync(`${stagedDbPath}-shm`, { force: true });
    replaceComponents(stagedDataDir, dataDir, stageRoot, manifest);
  } finally {
    fs.rmSync(stageRoot, { recursive: true, force: true });
  }
}

const [, , command, ...args] = process.argv;
if (command === 'assert-port-free' && args.length === 1) {
  await assertPortFree(parsePort(args[0]));
} else if (command === 'restore' && args.length === 3) {
  await restore(args[0], args[1], parsePort(args[2]));
} else {
  usage();
}
