import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, test } from 'vitest';

describe('Feishu route safety integration', () => {
  test('treats a configured resolver returning null as a dropped message', () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), 'src/feishu.ts'),
      'utf8',
    );

    expect(source).toContain('resolveAdmittedChannelRoute<FeishuMessageMeta>');
    expect(source).toContain(
      'Feishu binding resolver rejected route; dropping message',
    );
    expect(source).not.toContain('agentRouting?.effectiveJid ?? chatJid');
  });
});
