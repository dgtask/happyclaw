import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, test } from 'vitest';

const root = process.cwd();
const read = (relativePath: string) =>
  fs.readFileSync(path.join(root, relativePath), 'utf8');

describe('Web logical-run refresh contract', () => {
  test('publishes query start separately from the warm process lifecycle', () => {
    const queue = read('src/group-queue.ts');
    const web = read('src/web.ts');
    const types = read('src/types.ts');

    expect(queue).toMatch(/setOnQueryStart/);
    expect(queue).toMatch(/announceQueryStart/);
    expect(web).toMatch(/setOnQueryStart\(broadcastRunStarted\)/);
    expect(types).toMatch(/type: 'run_started'/);
  });

  test('reconnect snapshot is based on logical work, not a merely warm process', () => {
    const web = read('src/web.ts');
    const types = read('src/types.ts');

    expect(web).toMatch(/!g\.queryInFlight && !g\.pendingMessages/);
    expect(web).toMatch(/type: 'active_run_snapshot'/);
    expect(types).toMatch(/type: 'active_run_snapshot'/);
  });

  test('cross-tab user delivery and status recovery both open the waiting state', () => {
    const store = read('web/src/stores/chat.ts');
    const layout = read('web/src/components/layout/AppLayout.tsx');

    expect(store).toMatch(/const startsDirectRun/);
    expect(store).toMatch(/g\.queryInFlight \|\| g\.pendingMessages/);
    expect(store).toMatch(/handleActiveRunSnapshot/);
    expect(layout).toMatch(/wsManager\.on\('run_started'/);
    expect(layout).toMatch(/'active_run_snapshot'/);
  });
});
