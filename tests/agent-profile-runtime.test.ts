import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-profile-runtime-'));
const tmpStoreDir = path.join(tmpDir, 'db');
const tmpGroupsDir = path.join(tmpDir, 'groups');
fs.mkdirSync(tmpStoreDir, { recursive: true });
fs.mkdirSync(tmpGroupsDir, { recursive: true });

vi.mock('../src/config.js', async () => ({
  STORE_DIR: tmpStoreDir,
  GROUPS_DIR: tmpGroupsDir,
}));

vi.mock('../src/logger.js', () => ({
  logger: { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} },
}));

const db = await import('../src/db.js');
const runtime = await import('../src/agent-profile-runtime.js');

beforeAll(() => {
  db.initDatabase();
});

afterAll(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('AgentProfile runtime invalidation', () => {
  test('stops all workspace sibling and descendant runners', async () => {
    const folder = 'agent-profile-runtime-workspace';
    const now = new Date().toISOString();
    db.setRegisteredGroup('web:agent-profile-runtime-workspace', {
      name: 'Runtime Workspace',
      folder,
      added_at: now,
      executionMode: 'container',
      created_by: 'agent-profile-runtime-user',
    });
    db.setRegisteredGroup('feishu:runtime-channel', {
      name: 'Runtime Channel',
      folder,
      added_at: now,
      executionMode: 'container',
      created_by: 'agent-profile-runtime-user',
    });

    const stopGroup = vi.fn(async () => {});
    const deps = {
      queue: {
        listDescendantJids: (jid: string) =>
          jid === 'web:agent-profile-runtime-workspace'
            ? ['web:agent-profile-runtime-workspace#agent:a1']
            : ['feishu:runtime-channel#task:t1'],
        stopGroup,
      },
    } as unknown as Parameters<
      typeof runtime.stopWorkspaceRunnersForAgentIdentityChange
    >[0];

    const stopped = await runtime.stopWorkspaceRunnersForAgentIdentityChange(
      deps,
      folder,
      {
        primaryJid: 'web:agent-profile-runtime-workspace',
        reason: 'test identity change',
      },
    );

    expect(stopped.sort()).toEqual(
      [
        'feishu:runtime-channel',
        'feishu:runtime-channel#task:t1',
        'web:agent-profile-runtime-workspace',
        'web:agent-profile-runtime-workspace#agent:a1',
      ].sort(),
    );
    expect(stopGroup).toHaveBeenCalledTimes(4);
    expect(stopGroup).toHaveBeenCalledWith(
      'web:agent-profile-runtime-workspace',
      { force: true },
    );
    expect(stopGroup).toHaveBeenCalledWith('feishu:runtime-channel', {
      force: true,
    });
    expect(stopGroup).toHaveBeenCalledWith(
      'web:agent-profile-runtime-workspace#agent:a1',
      { force: true },
    );
    expect(stopGroup).toHaveBeenCalledWith('feishu:runtime-channel#task:t1', {
      force: true,
    });
  });
});

