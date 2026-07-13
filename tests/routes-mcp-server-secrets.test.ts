import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Hono } from 'hono';
import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest';

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'happyclaw-mcp-secrets-'));

vi.mock('../src/config.js', async (importOriginal) => {
  const real = await importOriginal<typeof import('../src/config.js')>();
  return { ...real, DATA_DIR: tmpDir };
});

vi.mock('../src/middleware/auth.ts', () => ({
  authMiddleware: async (c: any, next: any) => {
    c.set('user', {
      id: 'mcp-secret-user',
      username: 'mcp-secret-user',
      role: 'member',
      status: 'active',
      permissions: [],
      must_change_password: false,
    });
    return next();
  },
}));

const routes = (await import('../src/routes/mcp-servers.js')).default;
const app = new Hono().route('/api/mcp-servers', routes);

beforeAll(() => fs.mkdirSync(tmpDir, { recursive: true }));
afterAll(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

describe('MCP secret exposure boundary', () => {
  test('lists only secret keys and loads values from an explicit detail request', async () => {
    const create = await app.request('/api/mcp-servers', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        id: 'private_stdio',
        command: 'node',
        args: ['server.js'],
        env: { PRIVATE_TOKEN: 'top-secret' },
      }),
    });
    expect(create.status).toBe(200);
    expect(await create.json()).toMatchObject({
      server: { id: 'private_stdio', envKeys: ['PRIVATE_TOKEN'] },
    });

    const list = await app.request('/api/mcp-servers');
    expect(list.status).toBe(200);
    const listBody = await list.json();
    expect(listBody.servers[0]).toMatchObject({
      id: 'private_stdio',
      envKeys: ['PRIVATE_TOKEN'],
    });
    expect(listBody.servers[0]).not.toHaveProperty('env');
    expect(JSON.stringify(listBody)).not.toContain('top-secret');

    const detail = await app.request('/api/mcp-servers/private_stdio');
    expect(detail.status).toBe(200);
    expect(await detail.json()).toMatchObject({
      server: {
        id: 'private_stdio',
        env: { PRIVATE_TOKEN: 'top-secret' },
      },
    });
  });

  test('does not echo HTTP header values from create or list responses', async () => {
    const create = await app.request('/api/mcp-servers', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        id: 'private_http',
        type: 'http',
        url: 'https://example.com/mcp',
        headers: { Authorization: 'Bearer secret' },
      }),
    });
    const createBody = await create.json();
    expect(createBody.server).toMatchObject({
      id: 'private_http',
      headerKeys: ['Authorization'],
    });
    expect(createBody.server).not.toHaveProperty('headers');

    const list = await app.request('/api/mcp-servers');
    expect(JSON.stringify(await list.json())).not.toContain('Bearer secret');
  });
});
