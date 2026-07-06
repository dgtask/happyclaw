import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'routes-agent-profiles-'));
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

vi.mock('../src/agent-profile-generator.js', () => ({
  generateAgentProfileDraft: vi.fn(async (description: string) => ({
    name: description.includes('评审') ? '代码评审 Agent' : 'AI Agent',
    identity_prompt: `根据描述生成：${description}`,
  })),
}));

vi.mock('../src/middleware/auth.ts', () => ({
  authMiddleware: async (c: any, next: any) => {
    c.set('user', {
      id: 'routes-agent-user',
      username: 'routes-agent-user',
      role: 'member',
      permissions: [],
    });
    return next();
  },
}));

const db = await import('../src/db.js');
const routeModule = await import('../src/routes/agent-profiles.js');
const routes = routeModule.default;

beforeAll(() => {
  db.initDatabase();
  const now = new Date().toISOString();
  db.createUser({
    id: 'routes-agent-user',
    username: 'routes-agent-user',
    password_hash: 'hash',
    display_name: 'Routes Agent User',
    role: 'member',
    status: 'active',
    created_at: now,
    updated_at: now,
    must_change_password: false,
  });
});

afterAll(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('/api/agent-profiles routes', () => {
  test('GET returns the default AgentProfile', async () => {
    const res = await routes.request('/', { method: 'GET' });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.profiles).toHaveLength(1);
    expect(body.profiles[0].is_default).toBe(true);
  });

  test('POST creates and PATCH updates an AgentProfile', async () => {
    const createdRes = await routes.request('/', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: 'Research',
        identity_prompt: '用研究员方式回答。',
        include_claude_preset: false,
      }),
    });
    expect(createdRes.status).toBe(201);
    const createdBody = await createdRes.json();
    const created = createdBody.profile;
    expect(created.name).toBe('Research');
    expect(created.include_claude_preset).toBe(false);
    expect(created.version).toBe(1);

    const patchedRes = await routes.request(`/${created.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: 'Research Lead',
        identity_prompt: '先列证据，再给结论。',
        include_claude_preset: true,
      }),
    });
    expect(patchedRes.status).toBe(200);
    const patchedBody = await patchedRes.json();
    expect(patchedBody.profile.name).toBe('Research Lead');
    expect(patchedBody.profile.include_claude_preset).toBe(true);
    expect(patchedBody.profile.version).toBe(2);
  });

  test('rejects blank names after trim', async () => {
    const res = await routes.request('/', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: '   ' }),
    });
    expect(res.status).toBe(400);
  });

  test('POST /generate returns an AI AgentProfile draft', async () => {
    const res = await routes.request('/generate', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ description: '帮我做代码评审，重点看风险。' }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.draft).toEqual({
      name: '代码评审 Agent',
      identity_prompt: '根据描述生成：帮我做代码评审，重点看风险。',
    });
  });

  test('POST /generate rejects blank descriptions', async () => {
    const res = await routes.request('/generate', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ description: '   ' }),
    });
    expect(res.status).toBe(400);
  });

  test('does not delete the default AgentProfile', async () => {
    const [defaultProfile] = db.listAgentProfilesForUser('routes-agent-user');
    const res = await routes.request(`/${defaultProfile.id}`, {
      method: 'DELETE',
    });
    expect(res.status).toBe(400);
  });
});
