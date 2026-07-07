import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
  vi,
} from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmpDir = fs.mkdtempSync(
  path.join(os.tmpdir(), 'task-scheduler-contract-'),
);
const tmpStoreDir = path.join(tmpDir, 'db');
const tmpGroupsDir = path.join(tmpDir, 'groups');
fs.mkdirSync(tmpStoreDir, { recursive: true });
fs.mkdirSync(tmpGroupsDir, { recursive: true });

vi.mock(import('../src/config.js'), async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    DATA_DIR: tmpDir,
    STORE_DIR: tmpStoreDir,
    GROUPS_DIR: tmpGroupsDir,
  };
});

vi.mock('../src/logger.js', () => ({
  logger: { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} },
}));

const { runContainerAgentMock } = vi.hoisted(() => ({
  runContainerAgentMock: vi.fn(async (_group, input, _onProcess, onOutput) => {
    await onOutput?.({
      status: 'stream',
      result: 'partial',
      streamEvent: { type: 'text', text: 'partial' },
    });
    return {
      status: 'success',
      result: 'task result',
      newSessionId: 'task-session',
    };
  }),
}));

vi.mock('../src/container-runner.js', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../src/container-runner.js')>();
  return {
    ...actual,
    runContainerAgent: runContainerAgentMock,
  };
});

const db = await import('../src/db.js');
const { triggerTaskNow } = await import('../src/task-scheduler.js');

const GROUP_JID = 'web:task-contract';
const GROUP_FOLDER = 'task-contract';

function makeDeps(groups: Record<string, any>) {
  let runPromise: Promise<void> | null = null;
  const queue = {
    enqueueTask: vi.fn(
      (_jid: string, _taskId: string, fn: () => Promise<void>) => {
        runPromise = fn();
      },
    ),
    closeStdin: vi.fn(),
    isShuttingDown: () => false,
  };

  return {
    deps: {
      registeredGroups: () => groups,
      getSessions: () => ({}),
      queue,
      onProcess: vi.fn(),
      sendMessage: vi.fn(),
      broadcastStreamEvent: vi.fn(),
      storePromptMessage: vi.fn(),
      storeResultAndNotify: vi.fn(),
      assistantName: 'HappyClaw',
    } as any,
    queue,
    waitForRun: async () => {
      await runPromise;
    },
  };
}

function createTask(
  overrides: Partial<Parameters<typeof db.createTask>[0]> = {},
) {
  const id = overrides.id ?? `task-${Math.random().toString(36).slice(2, 8)}`;
  db.createTask({
    id,
    group_folder: GROUP_FOLDER,
    chat_jid: GROUP_JID,
    prompt: 'write a short status',
    schedule_type: 'cron',
    schedule_value: '0 9 * * *',
    context_mode: 'isolated',
    execution_type: 'agent',
    execution_mode: 'container',
    script_command: null,
    next_run: new Date(Date.now() + 60_000).toISOString(),
    status: 'active',
    created_at: new Date().toISOString(),
    notify_channels: null,
    created_by: undefined,
    ...overrides,
  });
  return id;
}

beforeAll(() => {
  db.initDatabase();
});

beforeEach(() => {
  runContainerAgentMock.mockClear();
  db.setRegisteredGroup(GROUP_JID, {
    name: 'Task Contract Workspace',
    folder: GROUP_FOLDER,
    added_at: new Date().toISOString(),
    executionMode: 'container',
    is_home: false,
  } as any);
});

afterAll(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('scheduled task workspace/session contract', () => {
  test('isolated task runs in the source workspace with a task-scoped Claude session', async () => {
    const taskId = createTask({ id: 'task-session-contract' });
    db.setSession(GROUP_FOLDER, 'main-session');
    const groups = {
      [GROUP_JID]: db.getRegisteredGroup(GROUP_JID)!,
    };
    const { deps, queue, waitForRun } = makeDeps(groups);

    const result = triggerTaskNow(taskId, deps);
    expect(result.success).toBe(true);
    await waitForRun();

    expect(queue.enqueueTask).toHaveBeenCalledWith(
      `${GROUP_JID}#task:${taskId}`,
      taskId,
      expect.any(Function),
      { allowInactive: true },
    );
    expect(runContainerAgentMock).toHaveBeenCalledTimes(1);
    const input = runContainerAgentMock.mock.calls[0][1];
    expect(input.groupFolder).toBe(GROUP_FOLDER);
    expect(input.chatJid).toBe(GROUP_JID);
    expect(input.taskRunId).toBe(taskId);
    expect(input.sessionAgentId).toBe(`task:${taskId}`);
    expect(input.isScheduledTask).toBe(true);

    expect(db.getSession(GROUP_FOLDER)).toBe('main-session');
    expect(db.getSession(GROUP_FOLDER, `task:${taskId}`)).toBe('task-session');
    const storedTask = db.getTaskById(taskId)!;
    expect(storedTask.workspace_jid).toBeNull();
    expect(storedTask.workspace_folder).toBeNull();
  });

  test('paused tasks can still be run manually once', async () => {
    const taskId = createTask({
      id: 'paused-manual-task',
      status: 'paused',
      next_run: null,
    });
    const groups = {
      [GROUP_JID]: db.getRegisteredGroup(GROUP_JID)!,
    };
    const { deps, waitForRun } = makeDeps(groups);

    const result = triggerTaskNow(taskId, deps);
    expect(result.success).toBe(true);
    await waitForRun();

    expect(runContainerAgentMock).toHaveBeenCalledTimes(1);
    expect(db.getTaskById(taskId)?.status).toBe('paused');
  });
});
