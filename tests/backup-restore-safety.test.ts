import { execFile } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

import Database from 'better-sqlite3';
import { afterAll, describe, expect, test } from 'vitest';

const execFileAsync = promisify(execFile);
const root = process.cwd();
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'backup-restore-safety-'));

afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));

function listen(server: net.Server): Promise<number> {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        reject(new Error('Unable to resolve test server port'));
        return;
      }
      resolve(address.port);
    });
  });
}

function close(server: net.Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

describe('runtime backup and restore safety', () => {
  test('omits generated session .claude links but preserves the surrounding session', async () => {
    const sourceData = path.join(tmp, 'generated-link-source-data');
    const backupDir = path.join(tmp, 'generated-link-backups');
    const extractDir = path.join(tmp, 'generated-link-extract');
    const dbDir = path.join(sourceData, 'db');
    const sessionRoot = path.join(
      sourceData,
      'sessions',
      'workspace-1',
      'agents',
      'agent-1',
    );
    const claudeDir = path.join(sessionRoot, '.claude');
    fs.mkdirSync(dbDir, { recursive: true });
    const db = new Database(path.join(dbDir, 'messages.db'));
    db.exec('CREATE TABLE sample (id INTEGER PRIMARY KEY)');
    db.close();
    fs.mkdirSync(path.join(claudeDir, 'skills'), { recursive: true });
    fs.writeFileSync(path.join(sessionRoot, 'conversation.json'), '{}');
    fs.symlinkSync('/tmp', path.join(claudeDir, 'skills', 'host-skill'));

    const { stdout } = await execFileAsync(
      'make',
      ['backup', `RUNTIME_DATA_DIR=${sourceData}`, `BACKUP_DIR=${backupDir}`],
      { cwd: root },
    );
    expect(stdout).toContain('可在运行时重建');
    const archive = path.join(
      backupDir,
      fs.readdirSync(backupDir).find((name) => name.endsWith('.tar.gz'))!,
    );
    fs.mkdirSync(extractDir, { recursive: true });
    await execFileAsync('tar', ['-xzf', archive, '-C', extractDir]);
    expect(
      fs.readFileSync(
        path.join(
          extractDir,
          'data',
          'sessions',
          'workspace-1',
          'agents',
          'agent-1',
          'conversation.json',
        ),
        'utf8',
      ),
    ).toBe('{}');
    expect(
      fs.existsSync(
        path.join(
          extractDir,
          'data',
          'sessions',
          'workspace-1',
          'agents',
          'agent-1',
          '.claude',
          'skills',
          'host-skill',
        ),
      ),
    ).toBe(false);
  });

  test('refuses to create an unrestorable archive from runtime symlinks', async () => {
    const sourceData = path.join(tmp, 'symlink-source-data');
    const backupDir = path.join(tmp, 'symlink-backups');
    const dbDir = path.join(sourceData, 'db');
    fs.mkdirSync(dbDir, { recursive: true });
    const db = new Database(path.join(dbDir, 'messages.db'));
    db.exec('CREATE TABLE sample (id INTEGER PRIMARY KEY)');
    db.close();
    fs.mkdirSync(path.join(sourceData, 'skills'), { recursive: true });
    fs.symlinkSync('/tmp', path.join(sourceData, 'skills', 'external'));

    await expect(
      execFileAsync(
        'make',
        ['backup', `RUNTIME_DATA_DIR=${sourceData}`, `BACKUP_DIR=${backupDir}`],
        { cwd: root },
      ),
    ).rejects.toThrow();
    expect(
      fs.existsSync(backupDir) ? fs.readdirSync(backupDir) : [],
    ).toHaveLength(0);
  });

  test('rejects symbolic links and other special archive entries before extraction', async () => {
    const archiveRoot = path.join(tmp, 'malicious-archive');
    const archive = path.join(tmp, 'malicious-backup.tar.gz');
    const restoreData = path.join(tmp, 'malicious-restore');
    fs.mkdirSync(path.join(archiveRoot, 'data', 'db'), { recursive: true });
    fs.symlinkSync('/tmp', path.join(archiveRoot, 'data', 'sessions'));
    await execFileAsync('tar', ['-czf', archive, '-C', archiveRoot, 'data']);

    const portProbe = net.createServer();
    const port = await listen(portProbe);
    await close(portProbe);

    await expect(
      execFileAsync(
        'node',
        [
          'scripts/restore-backup.mjs',
          'restore',
          archive,
          restoreData,
          String(port),
        ],
        { cwd: root },
      ),
    ).rejects.toThrow(/Unsafe backup archive entry type/);
    expect(fs.existsSync(restoreData)).toBe(false);
  });

  test('rejects forged symlink metadata that escapes restored data', async () => {
    const archiveRoot = path.join(tmp, 'malicious-metadata-archive');
    const archive = path.join(tmp, 'malicious-metadata-backup.tar.gz');
    const restoreData = path.join(tmp, 'malicious-metadata-restore');
    const dbDir = path.join(archiveRoot, 'data', 'db');
    fs.mkdirSync(dbDir, { recursive: true });
    const db = new Database(path.join(dbDir, 'messages.db'));
    db.exec('CREATE TABLE sample (id INTEGER PRIMARY KEY)');
    db.close();
    fs.mkdirSync(path.join(archiveRoot, 'data', 'groups'), { recursive: true });
    fs.writeFileSync(
      path.join(archiveRoot, 'data', 'backup-symlinks.json'),
      JSON.stringify({
        formatVersion: 1,
        links: [{ path: 'groups/escape', target: '../../../tmp' }],
      }),
    );
    await execFileAsync('tar', ['-czf', archive, '-C', archiveRoot, 'data']);

    const portProbe = net.createServer();
    const port = await listen(portProbe);
    await close(portProbe);
    await expect(
      execFileAsync(
        'node',
        [
          'scripts/restore-backup.mjs',
          'restore',
          archive,
          restoreData,
          String(port),
        ],
        { cwd: root },
      ),
    ).rejects.toThrow(/escapes restored data/);
    expect(fs.existsSync(restoreData)).toBe(false);
  });

  test('restores realistic archives whose validated file listing exceeds one MiB', async () => {
    const archiveRoot = path.join(tmp, 'large-listing-archive');
    const archive = path.join(tmp, 'large-listing-backup.tar.gz');
    const restoreData = path.join(tmp, 'large-listing-restore');
    const dbDir = path.join(archiveRoot, 'data', 'db');
    const groupsDir = path.join(archiveRoot, 'data', 'groups');
    fs.mkdirSync(dbDir, { recursive: true });
    fs.mkdirSync(groupsDir, { recursive: true });
    const db = new Database(path.join(dbDir, 'messages.db'));
    db.exec('CREATE TABLE sample (id INTEGER PRIMARY KEY)');
    db.close();
    const suffix = 'x'.repeat(180);
    for (let index = 0; index < 5_000; index += 1) {
      fs.writeFileSync(path.join(groupsDir, `entry-${index}-${suffix}`), 'x');
    }
    await execFileAsync('tar', ['-czf', archive, '-C', archiveRoot, 'data']);

    const portProbe = net.createServer();
    const port = await listen(portProbe);
    await close(portProbe);
    await execFileAsync(
      'node',
      [
        'scripts/restore-backup.mjs',
        'restore',
        archive,
        restoreData,
        String(port),
      ],
      { cwd: root },
    );
    expect(fs.readdirSync(path.join(restoreData, 'groups'))).toHaveLength(
      5_000,
    );
  }, 20_000);

  test('includes committed WAL rows and refuses restore while the service port is active', async () => {
    const sourceData = path.join(tmp, 'source-data');
    const backupDir = path.join(tmp, 'backups');
    const restoreData = path.join(tmp, 'restored-data');
    const dbDir = path.join(sourceData, 'db');
    const dbPath = path.join(dbDir, 'messages.db');
    fs.mkdirSync(dbDir, { recursive: true });
    fs.mkdirSync(path.join(sourceData, 'config'), { recursive: true });
    const sessionSecretPath = path.join(
      sourceData,
      'config',
      'session-secret.key',
    );
    fs.writeFileSync(sessionSecretPath, 'test-only-secret', { mode: 0o644 });
    const persistentMarkers = [
      ['mcp-servers', 'user-1', 'servers.json'],
      ['plugins', 'users', 'user-1.json'],
      ['memory', 'workspace-1', 'memory.md'],
      ['avatars', 'agent-1.txt'],
      ['builtin-skills', 'catalog.json'],
    ];
    for (const parts of persistentMarkers) {
      const markerPath = path.join(sourceData, ...parts);
      fs.mkdirSync(path.dirname(markerPath), { recursive: true });
      fs.writeFileSync(markerPath, `marker:${parts.join('/')}`);
    }
    const workspaceRoot = path.join(sourceData, 'groups', 'workspace-1');
    fs.mkdirSync(workspaceRoot, { recursive: true });
    fs.writeFileSync(path.join(workspaceRoot, 'CLAUDE.md'), 'workspace rules');
    fs.symlinkSync('CLAUDE.md', path.join(workspaceRoot, 'AGENTS.md'));
    fs.symlinkSync('/tmp', path.join(workspaceRoot, 'external-cache'));

    const writer = new Database(dbPath);
    try {
      writer.pragma('journal_mode = WAL');
      writer.pragma('wal_autocheckpoint = 0');
      writer.exec(
        'CREATE TABLE audit_rows (id INTEGER PRIMARY KEY, value TEXT)',
      );
      writer.prepare('INSERT INTO audit_rows(value) VALUES (?)').run('main');
      writer.pragma('wal_checkpoint(TRUNCATE)');
      writer.prepare('INSERT INTO audit_rows(value) VALUES (?)').run('wal');

      expect(fs.statSync(`${dbPath}-wal`).size).toBeGreaterThan(0);
      const detachedMain = path.join(tmp, 'detached-main.db');
      fs.copyFileSync(dbPath, detachedMain);
      const detached = new Database(detachedMain, { readonly: true });
      expect(
        (
          detached
            .prepare('SELECT COUNT(*) AS count FROM audit_rows')
            .get() as {
            count: number;
          }
        ).count,
      ).toBe(1);
      detached.close();

      await execFileAsync(
        'make',
        ['backup', `RUNTIME_DATA_DIR=${sourceData}`, `BACKUP_DIR=${backupDir}`],
        { cwd: root },
      );
      const archives = fs
        .readdirSync(backupDir)
        .filter((name) => name.endsWith('.tar.gz'));
      expect(archives).toHaveLength(1);
      const archive = path.join(backupDir, archives[0]);

      const activeServer = net.createServer();
      const port = await listen(activeServer);
      try {
        await expect(
          execFileAsync(
            'make',
            [
              'restore',
              `FILE=${archive}`,
              `RUNTIME_DATA_DIR=${restoreData}`,
              `PORT=${port}`,
            ],
            { cwd: root },
          ),
        ).rejects.toThrow();
        expect(fs.existsSync(path.join(restoreData, 'db', 'messages.db'))).toBe(
          false,
        );
      } finally {
        await close(activeServer);
      }

      const staleExtra = path.join(restoreData, 'extra', 'stale.txt');
      fs.mkdirSync(path.dirname(staleExtra), { recursive: true });
      fs.writeFileSync(staleExtra, 'must be removed by authoritative restore');
      await execFileAsync(
        'node',
        [
          'scripts/restore-backup.mjs',
          'restore',
          archive,
          restoreData,
          String(port),
        ],
        { cwd: root },
      );

      const restoredDbPath = path.join(restoreData, 'db', 'messages.db');
      expect(
        fs.statSync(path.join(restoreData, 'config', 'session-secret.key'))
          .mode & 0o777,
      ).toBe(0o600);
      for (const parts of persistentMarkers) {
        expect(fs.readFileSync(path.join(restoreData, ...parts), 'utf8')).toBe(
          `marker:${parts.join('/')}`,
        );
      }
      const restoredWorkspaceLink = path.join(
        restoreData,
        'groups',
        'workspace-1',
        'AGENTS.md',
      );
      expect(fs.lstatSync(restoredWorkspaceLink).isSymbolicLink()).toBe(true);
      expect(fs.readlinkSync(restoredWorkspaceLink)).toBe('CLAUDE.md');
      expect(fs.readFileSync(restoredWorkspaceLink, 'utf8')).toBe(
        'workspace rules',
      );
      expect(
        fs.existsSync(
          path.join(restoreData, 'groups', 'workspace-1', 'external-cache'),
        ),
      ).toBe(false);
      expect(fs.existsSync(path.join(restoreData, 'extra'))).toBe(false);
      expect(fs.existsSync(`${restoredDbPath}-wal`)).toBe(false);
      expect(fs.existsSync(`${restoredDbPath}-shm`)).toBe(false);
      const restored = new Database(restoredDbPath, { readonly: true });
      expect(
        (
          restored
            .prepare('SELECT COUNT(*) AS count FROM audit_rows')
            .get() as { count: number }
        ).count,
      ).toBe(2);
      restored.close();
    } finally {
      writer.close();
    }
  }, 20_000);
});
