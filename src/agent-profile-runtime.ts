import type { WebDeps } from './web-context.js';
import {
  getAllRegisteredGroups,
  getJidsByFolder,
  getOrCreateDefaultAgentProfile,
  getWorkspaceAgentProfileId,
} from './db.js';
import type { RegisteredGroup } from './types.js';
import { logger } from './logger.js';

export interface AgentProfileWorkspace {
  jid: string;
  group: RegisteredGroup;
}

export function listWorkspaceGroupsForAgentProfile(
  ownerUserId: string,
  profileId: string,
): AgentProfileWorkspace[] {
  const defaultProfile = getOrCreateDefaultAgentProfile(ownerUserId);
  return Object.entries(getAllRegisteredGroups())
    .filter(([jid, group]) => {
      if (!jid.startsWith('web:')) return false;
      if (group.created_by !== ownerUserId) return false;
      const mappedProfileId =
        getWorkspaceAgentProfileId(group.folder) ?? defaultProfile.id;
      return mappedProfileId === profileId;
    })
    .map(([jid, group]) => ({ jid, group }));
}

export function getWorkspaceRuntimeJids(
  deps: WebDeps,
  folder: string,
  primaryJid?: string,
): string[] {
  const siblingJids = getJidsByFolder(folder);
  if (primaryJid && !siblingJids.includes(primaryJid)) {
    siblingJids.push(primaryJid);
  }

  const descendantJids = Array.from(
    new Set(siblingJids.flatMap((jid) => deps.queue.listDescendantJids(jid))),
  );
  return Array.from(new Set([...siblingJids, ...descendantJids]));
}

export async function stopWorkspaceRunnersForAgentIdentityChange(
  deps: WebDeps,
  folder: string,
  options: {
    primaryJid?: string;
    reason: string;
  },
): Promise<string[]> {
  const stopJids = getWorkspaceRuntimeJids(deps, folder, options.primaryJid);
  const errors: Array<{ jid: string; err: unknown }> = [];

  for (const jid of stopJids) {
    try {
      await deps.queue.stopGroup(jid, { force: true });
    } catch (err) {
      errors.push({ jid, err });
    }
  }

  if (errors.length > 0) {
    logger.error(
      { folder, stopJids, errors, reason: options.reason },
      'Failed to stop workspace runners for Agent identity change',
    );
    throw new Error('Failed to stop workspace runners');
  }

  if (stopJids.length > 0) {
    logger.info(
      { folder, stopJids, reason: options.reason },
      'Stopped workspace runners for Agent identity change',
    );
  }

  return stopJids;
}

