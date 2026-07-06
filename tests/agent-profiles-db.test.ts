import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-profiles-db-'));
const tmpStoreDir = path.join(tmpDir, 'db');
const tmpGroupsDir = path.join(tmpDir, 'groups');
fs.mkdirSync(tmpStoreDir, { recursive: true });
fs.mkdirSync(tmpGroupsDir, { recursive: true });

vi.mock('../src/config.js', async () => ({
  STORE_DIR: tmpStoreDir,
  GROUPS_DIR: tmpGroupsDir,
}));

const {
  initDatabase,
  createUser,
  listAgentProfilesForUser,
  createAgentProfile,
  updateAgentProfile,
  archiveAgentProfile,
  assignWorkspaceAgentProfile,
  getAgentProfileForWorkspace,
  getWorkspaceAgentProfileId,
  setRegisteredGroup,
  setSession,
  getSessionAgentIdentity,
  computeAgentProfileIdentityHash,
} = await import('../src/db.js');

beforeAll(() => {
  initDatabase();
});

afterAll(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function seedUser(id: string): void {
  const now = new Date().toISOString();
  createUser({
    id,
    username: id,
    password_hash: 'hash',
    display_name: id,
    role: 'member',
    status: 'active',
    created_at: now,
    updated_at: now,
    must_change_password: false,
  });
}

describe('AgentProfile DB model', () => {
  test('creates one default AgentProfile for every new user', () => {
    seedUser('agent-profile-user-a');

    const profiles = listAgentProfilesForUser('agent-profile-user-a');

    expect(profiles).toHaveLength(1);
    expect(profiles[0].is_default).toBe(true);
    expect(profiles[0].name).toBe('Default Agent');
    expect(profiles[0].identity_prompt).toBe('');
    expect(profiles[0].include_claude_preset).toBe(true);
    expect(profiles[0].identity_hash).toBe(
      computeAgentProfileIdentityHash('', true),
    );
  });

  test('maps a workspace to the selected AgentProfile', () => {
    seedUser('agent-profile-user-b');
    const profile = createAgentProfile({
      ownerUserId: 'agent-profile-user-b',
      name: 'Research Agent',
      identityPrompt: '以研究员身份回答。',
      includeClaudePreset: false,
    });
    const folder = 'agent-profile-workspace-b';
    setRegisteredGroup('web:agent-profile-workspace-b', {
      name: 'Workspace B',
      folder,
      added_at: new Date().toISOString(),
      executionMode: 'container',
      created_by: 'agent-profile-user-b',
    });

    assignWorkspaceAgentProfile(folder, profile.id);

    expect(getWorkspaceAgentProfileId(folder)).toBe(profile.id);
    const mapped = getAgentProfileForWorkspace(folder, 'agent-profile-user-b');
    expect(mapped?.id).toBe(profile.id);
    expect(mapped?.include_claude_preset).toBe(false);
    expect(mapped?.identity_hash).toBe(
      computeAgentProfileIdentityHash('以研究员身份回答。', false),
    );
  });

  test('updates identity hash and version when identity prompt or preset mode changes', () => {
    seedUser('agent-profile-user-c');
    const profile = createAgentProfile({
      ownerUserId: 'agent-profile-user-c',
      name: 'Coder',
      identityPrompt: '写代码前先读上下文。',
    });

    const renamed = updateAgentProfile(profile.id, 'agent-profile-user-c', {
      name: 'Coder Renamed',
    });
    expect(renamed?.version).toBe(profile.version);
    expect(renamed?.identity_hash).toBe(profile.identity_hash);

    const updated = updateAgentProfile(profile.id, 'agent-profile-user-c', {
      identityPrompt: '先读上下文，再给最小可行改动。',
    });
    expect(updated?.version).toBe(profile.version + 1);
    expect(updated?.identity_hash).toBe(
      computeAgentProfileIdentityHash('先读上下文，再给最小可行改动。', true),
    );

    const presetToggled = updateAgentProfile(profile.id, 'agent-profile-user-c', {
      includeClaudePreset: false,
    });
    expect(presetToggled?.version).toBe((updated?.version ?? 0) + 1);
    expect(presetToggled?.identity_hash).toBe(
      computeAgentProfileIdentityHash('先读上下文，再给最小可行改动。', false),
    );
  });

  test('stores AgentProfile identity metadata on sessions', () => {
    seedUser('agent-profile-user-d');
    const profile = createAgentProfile({
      ownerUserId: 'agent-profile-user-d',
      name: 'Planner',
      identityPrompt: '先拆计划再执行。',
    });

    setSession('agent-profile-workspace-d', 'session-d', undefined, {
      agentProfileId: profile.id,
      identityHash: profile.identity_hash,
    });

    expect(getSessionAgentIdentity('agent-profile-workspace-d')).toEqual({
      agent_profile_id: profile.id,
      identity_hash: profile.identity_hash,
    });
  });

  test('does not archive an AgentProfile that still owns workspaces', () => {
    seedUser('agent-profile-user-e');
    const [defaultProfile] = listAgentProfilesForUser('agent-profile-user-e');
    const profile = createAgentProfile({
      ownerUserId: 'agent-profile-user-e',
      name: 'Ops',
      identityPrompt: '关注运行风险。',
    });
    const folder = 'agent-profile-workspace-e';
    assignWorkspaceAgentProfile(folder, profile.id);

    expect(archiveAgentProfile(profile.id, 'agent-profile-user-e')).toBe(
      'has_workspaces',
    );

    assignWorkspaceAgentProfile(folder, defaultProfile.id);
    expect(archiveAgentProfile(profile.id, 'agent-profile-user-e')).toBe('ok');
  });
});
