import { Hono } from 'hono';
import type { Variables } from '../web-context.js';
import { getWebDeps } from '../web-context.js';
import { authMiddleware } from '../middleware/auth.js';
import {
  AgentProfileCreateSchema,
  AgentProfileGenerateSchema,
  AgentProfilePatchSchema,
} from '../schemas.js';
import type { AuthUser } from '../types.js';
import { generateAgentProfileDraft } from '../agent-profile-generator.js';
import { logger } from '../logger.js';
import {
  listWorkspaceGroupsForAgentProfile,
  stopWorkspaceRunnersForAgentIdentityChange,
} from '../agent-profile-runtime.js';
import {
  archiveAgentProfile,
  createAgentProfile,
  getAgentProfileForUser,
  getAllRegisteredGroups,
  getOrCreateDefaultAgentProfile,
  getWorkspaceAgentProfileId,
  listAgentProfilesForUser,
  updateAgentProfile,
} from '../db.js';

const agentProfileRoutes = new Hono<{ Variables: Variables }>();

agentProfileRoutes.get('/', authMiddleware, (c) => {
  const user = c.get('user') as AuthUser;
  const profiles = listAgentProfilesForUser(user.id);
  return c.json({ profiles });
});

agentProfileRoutes.post('/', authMiddleware, async (c) => {
  const user = c.get('user') as AuthUser;
  const body = await c.req.json().catch(() => ({}));
  const parsed = AgentProfileCreateSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: 'Invalid request body' }, 400);
  }
  const profile = createAgentProfile({
    ownerUserId: user.id,
    name: parsed.data.name,
    identityPrompt: parsed.data.identity_prompt ?? '',
    includeClaudePreset: parsed.data.include_claude_preset ?? true,
  });
  return c.json({ profile }, 201);
});

agentProfileRoutes.post('/generate', authMiddleware, async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const parsed = AgentProfileGenerateSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: 'Invalid request body' }, 400);
  }

  try {
    const draft = await generateAgentProfileDraft(parsed.data.description);
    return c.json({ draft });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : 'AI 解析失败，请重试或手动填写';
    logger.warn(
      { err, descriptionLen: parsed.data.description.length },
      'Failed to generate Agent profile draft',
    );
    return c.json(
      { error: message },
      message.includes('未配置') ? 503 : 502,
    );
  }
});

agentProfileRoutes.patch('/:id', authMiddleware, async (c) => {
  const user = c.get('user') as AuthUser;
  const id = c.req.param('id');
  const body = await c.req.json().catch(() => ({}));
  const parsed = AgentProfilePatchSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: 'Invalid request body' }, 400);
  }
  if (
    parsed.data.name === undefined &&
    parsed.data.identity_prompt === undefined &&
    parsed.data.include_claude_preset === undefined
  ) {
    return c.json({ error: 'No changes provided' }, 400);
  }
  const existing = getAgentProfileForUser(id, user.id);
  if (!existing) return c.json({ error: 'Agent profile not found' }, 404);

  const identityWillChange =
    (parsed.data.identity_prompt !== undefined &&
      parsed.data.identity_prompt !== existing.identity_prompt) ||
    (parsed.data.include_claude_preset !== undefined &&
      parsed.data.include_claude_preset !== existing.include_claude_preset);

  const profile = updateAgentProfile(id, user.id, {
    name: parsed.data.name,
    identityPrompt: parsed.data.identity_prompt,
    includeClaudePreset: parsed.data.include_claude_preset,
  });
  if (!profile) return c.json({ error: 'Agent profile not found' }, 404);

  let invalidatedRuntimeJids = 0;
  if (identityWillChange) {
    const deps = getWebDeps();
    if (deps) {
      const workspaces = listWorkspaceGroupsForAgentProfile(user.id, id);
      try {
        for (const workspace of workspaces) {
          const stopped = await stopWorkspaceRunnersForAgentIdentityChange(
            deps,
            workspace.group.folder,
            {
              primaryJid: workspace.jid,
              reason: `Agent profile ${id} identity changed`,
            },
          );
          invalidatedRuntimeJids += stopped.length;
        }
      } catch (err) {
        logger.error(
          { err, agentProfileId: id },
          'Agent profile updated but active workspace invalidation failed',
        );
        return c.json(
          {
            error:
              'Agent profile updated, but failed to refresh active workspaces',
          },
          500,
        );
      }
    }
  }

  return c.json({ profile, invalidated_runtime_jids: invalidatedRuntimeJids });
});

agentProfileRoutes.delete('/:id', authMiddleware, (c) => {
  const user = c.get('user') as AuthUser;
  const id = c.req.param('id');
  const result = archiveAgentProfile(id, user.id);
  if (result === 'not_found') {
    return c.json({ error: 'Agent profile not found' }, 404);
  }
  if (result === 'is_default') {
    return c.json({ error: 'Default Agent cannot be deleted' }, 400);
  }
  if (result === 'has_workspaces') {
    return c.json(
      { error: 'Agent profile still owns workspaces; move or delete them first' },
      409,
    );
  }
  return c.json({ success: true });
});

agentProfileRoutes.get('/:id/workspaces', authMiddleware, (c) => {
  const user = c.get('user') as AuthUser;
  const id = c.req.param('id');
  const profile = getAgentProfileForUser(id, user.id);
  if (!profile) return c.json({ error: 'Agent profile not found' }, 404);

  const defaultProfile = getOrCreateDefaultAgentProfile(user.id);
  const groups = getAllRegisteredGroups();
  const workspaces = Object.entries(groups)
    .filter(([jid, group]) => {
      if (!jid.startsWith('web:')) return false;
      if (group.created_by !== user.id) return false;
      const mapped = getWorkspaceAgentProfileId(group.folder) ?? defaultProfile.id;
      return mapped === id;
    })
    .map(([jid, group]) => ({
      jid,
      name: group.name,
      folder: group.folder,
      is_home: !!group.is_home,
      execution_mode: group.executionMode ?? 'container',
      added_at: group.added_at,
    }));

  return c.json({ profile, workspaces });
});

export default agentProfileRoutes;
