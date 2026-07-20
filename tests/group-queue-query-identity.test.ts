import { describe, expect, test, vi } from 'vitest';

vi.mock('../src/config.js', async (importOriginal) => {
  const real = (await importOriginal()) as Record<string, unknown>;
  return { ...real, DATA_DIR: '/tmp/happyclaw-query-identity-test' };
});
vi.mock('../src/logger.js', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock('../src/container-runner.js', () => ({ killProcessTree: vi.fn() }));
vi.mock('../src/runtime-config.js', () => ({
  getSystemSettings: () => ({
    maxConcurrentContainers: 20,
    maxConcurrentHostProcesses: 5,
  }),
}));
vi.mock('../src/db.js', () => ({ getTaskById: () => undefined }));

const { GroupQueue } = await import('../src/group-queue.js');

describe('GroupQueue query identity', () => {
  test('clears the completed id before the idle callback reserves the next query', () => {
    const queue = new GroupQueue();
    const jid = 'web:query-id';
    const state = (queue as any).getGroup(jid);
    state.active = true;
    state.groupFolder = 'query-id';
    state.queryInFlight = true;
    state.queryId = 'run-1';

    let completed: string | undefined;
    let next: string | null = null;
    queue.setOnQueryIdle((callbackJid, completedQueryId) => {
      expect(callbackJid).toBe(jid);
      expect(queue.getActiveQueryId(jid)).toBeNull();
      completed = completedQueryId;
      next = queue.reserveNextQuery(jid);
    });

    queue.markRunnerQueryIdle(jid);

    expect(completed).toBe('run-1');
    expect(next).toBeTruthy();
    expect(next).not.toBe('run-1');
    expect(queue.getActiveQueryId(jid)).toBe(next);
    expect(queue.interruptQuery(jid, 'run-1')).toBe(false);
  });
});
