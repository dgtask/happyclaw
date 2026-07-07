import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
  vi,
} from 'vitest';

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'routes-tasks-contract-'));
const tmpStoreDir = path.join(tmpDir, 'db');
const tmpGroupsDir = path.join(tmpDir, 'groups');
fs.mkdirSync(tmpStoreDir, { recursive: true });
fs.mkdirSync(tmpGroupsDir, { recursive: true });

vi.mock('../src/config.js', async (importOriginal) => {
  const real = (await importOriginal()) as Record<string, unknown>;
  return {
    ...real,
    DATA_DIR: tmpDir,
    STORE_DIR: tmpStoreDir,
    GROUPS_DIR: tmpGroupsDir,
  };
});

vi.mock('../src/logger.js', () => ({
  logger: { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} },
}));

vi.mock('../src/web.js', () => ({
  getWebDeps: () => null,
}));

vi.mock('../src/middleware/auth.ts', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../src/middleware/auth.js')>();
  return {
    ...actual,
    authMiddleware: async (c: any, next: any) => {
      c.set('user', {
        id: process.env.HAPPYCLAW_TEST_USER_ID ?? 'alice',
        username: process.env.HAPPYCLAW_TEST_USER_ID ?? 'alice',
        role: process.env.HAPPYCLAW_TEST_USER_ROLE ?? 'member',
        permissions: [],
      });
      return next();
    },
  };
});

const tasksRoutesModule = await import('../src/routes/tasks.js');
const db = await import('../src/db.js');

const tasksRoutes = tasksRoutesModule.default;

const OWNER_ID = 'alice';
const MEMBER_ID = 'bob';
const ADMIN_ID = 'admin-user';
const GROUP_JID = 'web:tasks-contract';
const GROUP_FOLDER = 'tasks-contract';

function asUser(userId: string, role: 'admin' | 'member' = 'member'): void {
  process.env.HAPPYCLAW_TEST_USER_ID = userId;
  process.env.HAPPYCLAW_TEST_USER_ROLE = role;
}

function seedGroup(): void {
  db.setRegisteredGroup(GROUP_JID, {
    name: 'Tasks Contract Workspace',
    folder: GROUP_FOLDER,
    added_at: new Date().toISOString(),
    executionMode: 'container',
    created_by: OWNER_ID,
    is_home: false,
  } as any);
  db.addGroupMember(GROUP_FOLDER, OWNER_ID, 'owner');
  db.addGroupMember(GROUP_FOLDER, MEMBER_ID, 'member');
  db.addGroupMember(GROUP_FOLDER, ADMIN_ID, 'member');
  fs.mkdirSync(path.join(tmpGroupsDir, GROUP_FOLDER), { recursive: true });
}

function createTask(
  id: string,
  createdBy: string | null,
  overrides: Partial<Parameters<typeof db.createTask>[0]> = {},
): void {
  db.createTask({
    id,
    group_folder: GROUP_FOLDER,
    chat_jid: GROUP_JID,
    prompt: `prompt for ${id}`,
    schedule_type: 'cron',
    schedule_value: '0 9 * * *',
    context_mode: 'isolated',
    execution_type: 'agent',
    execution_mode: 'container',
    script_command: null,
    next_run: new Date(Date.now() + 60_000).toISOString(),
    status: 'active',
    created_at: new Date().toISOString(),
    created_by: createdBy ?? undefined,
    notify_channels: null,
    ...overrides,
  });
}

async function getTasks() {
  const res = await tasksRoutes.request('/', { method: 'GET' });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}

async function deleteTask(id: string) {
  const res = await tasksRoutes.request(`/${id}`, { method: 'DELETE' });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}

beforeAll(() => {
  db.initDatabase();
});

beforeEach(() => {
  for (const id of [
    'alice-task',
    'bob-task',
    'legacy-task',
    'dirty-source-task',
  ]) {
    try {
      db.deleteTask(id);
    } catch {
      /* ignore */
    }
  }
  seedGroup();
});

afterEach(() => {
  delete process.env.HAPPYCLAW_TEST_USER_ID;
  delete process.env.HAPPYCLAW_TEST_USER_ROLE;
});

afterAll(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('tasks route ownership and cleanup contract', () => {
  test('GET / hides other members tasks in a shared workspace', async () => {
    createTask('alice-task', OWNER_ID);
    createTask('bob-task', MEMBER_ID);
    createTask('legacy-task', null);

    asUser(OWNER_ID);
    const ownerRes = await getTasks();
    expect(ownerRes.status).toBe(200);
    expect(ownerRes.body.tasks.map((t: any) => t.id)).toEqual(
      expect.arrayContaining(['alice-task']),
    );
    expect(ownerRes.body.tasks).toHaveLength(1);

    asUser(MEMBER_ID);
    const memberRes = await getTasks();
    expect(memberRes.status).toBe(200);
    expect(memberRes.body.tasks.map((t: any) => t.id)).toEqual(
      expect.arrayContaining(['bob-task']),
    );
    expect(memberRes.body.tasks).toHaveLength(1);

    asUser(ADMIN_ID, 'admin');
    const adminRes = await getTasks();
    expect(adminRes.status).toBe(200);
    expect(adminRes.body.tasks.map((t: any) => t.id)).toEqual(
      expect.arrayContaining(['legacy-task', 'bob-task', 'alice-task']),
    );
    expect(adminRes.body.tasks).toHaveLength(3);
  });

  test('DELETE task never deletes the source workspace when workspace fields point at it', async () => {
    createTask('dirty-source-task', OWNER_ID);
    db.updateTaskWorkspace('dirty-source-task', GROUP_JID, GROUP_FOLDER);
    const marker = path.join(tmpGroupsDir, GROUP_FOLDER, 'keep.txt');
    fs.writeFileSync(marker, 'workspace data');

    asUser(OWNER_ID);
    const res = await deleteTask('dirty-source-task');
    expect(res.status).toBe(200);
    expect(db.getTaskById('dirty-source-task')).toBeUndefined();
    expect(db.getRegisteredGroup(GROUP_JID)).toBeTruthy();
    expect(fs.readFileSync(marker, 'utf8')).toBe('workspace data');
  });
});
