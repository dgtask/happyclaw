import { create } from 'zustand';
import { api } from '../api/client';
import type { AgentProfile, GroupInfo } from '../types';
import { useChatStore } from './chat';
import { useGroupsStore } from './groups';

interface AgentProfileDraft {
  name: string;
  identity_prompt: string;
}

interface AgentProfilesState {
  profiles: AgentProfile[];
  loading: boolean;
  error: string | null;
  loadProfiles: () => Promise<void>;
  generateProfileDraft: (description: string) => Promise<AgentProfileDraft>;
  createProfile: (data: {
    name: string;
    identity_prompt?: string;
    include_claude_preset?: boolean;
  }) => Promise<AgentProfile>;
  updateProfile: (
    id: string,
    data: { name?: string; identity_prompt?: string; include_claude_preset?: boolean },
  ) => Promise<AgentProfile>;
  deleteProfile: (id: string) => Promise<void>;
  setWorkspaceAgentProfile: (jid: string, profileId: string) => Promise<void>;
}

export const useAgentProfilesStore = create<AgentProfilesState>((set, get) => ({
  profiles: [],
  loading: false,
  error: null,

  loadProfiles: async () => {
    set({ loading: true });
    try {
      const data = await api.get<{ profiles: AgentProfile[] }>('/api/agent-profiles');
      set({ profiles: data.profiles, loading: false, error: null });
    } catch (err) {
      set({
        loading: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  },

  generateProfileDraft: async (description) => {
    try {
      const res = await api.post<{ draft: AgentProfileDraft }>(
        '/api/agent-profiles/generate',
        { description },
        60_000,
      );
      set({ error: null });
      return res.draft;
    } catch (err) {
      set({ error: err instanceof Error ? err.message : String(err) });
      throw err;
    }
  },

  createProfile: async (data) => {
    try {
      const res = await api.post<{ profile: AgentProfile }>('/api/agent-profiles', data);
      set((state) => ({
        profiles: [res.profile, ...state.profiles.filter((p) => p.id !== res.profile.id)].sort(
          (a, b) => Number(b.is_default) - Number(a.is_default),
        ),
        error: null,
      }));
      await get().loadProfiles();
      return res.profile;
    } catch (err) {
      set({ error: err instanceof Error ? err.message : String(err) });
      throw err;
    }
  },

  updateProfile: async (id, data) => {
    try {
      const res = await api.patch<{ profile: AgentProfile }>(
        `/api/agent-profiles/${encodeURIComponent(id)}`,
        data,
      );
      set((state) => ({
        profiles: state.profiles.map((p) => (p.id === id ? res.profile : p)),
        error: null,
      }));
      await Promise.all([
        useChatStore.getState().loadGroups(),
        useGroupsStore.getState().loadGroups(),
      ]);
      return res.profile;
    } catch (err) {
      set({ error: err instanceof Error ? err.message : String(err) });
      throw err;
    }
  },

  deleteProfile: async (id) => {
    try {
      await api.delete(`/api/agent-profiles/${encodeURIComponent(id)}`);
      set((state) => ({
        profiles: state.profiles.filter((p) => p.id !== id),
        error: null,
      }));
    } catch (err) {
      set({ error: err instanceof Error ? err.message : String(err) });
      throw err;
    }
  },

  setWorkspaceAgentProfile: async (jid, profileId) => {
    try {
      const res = await api.patch<{
        success: boolean;
        agent_profile_id: string;
        agent_profile_name: string;
        agent_profile_version: number;
      }>(`/api/groups/${encodeURIComponent(jid)}/agent-profile`, {
        agent_profile_id: profileId,
      });
      const patchGroup = (group?: GroupInfo): GroupInfo | undefined =>
        group
          ? {
              ...group,
              agent_profile_id: res.agent_profile_id,
              agent_profile_name: res.agent_profile_name,
              agent_profile_version: res.agent_profile_version,
            }
          : group;

      useChatStore.setState((state) => {
        const patched = patchGroup(state.groups[jid]);
        if (!patched) return state;
        return { groups: { ...state.groups, [jid]: patched } };
      });
      useGroupsStore.setState((state) => {
        const patched = patchGroup(state.groups[jid]);
        if (!patched) return state;
        return { groups: { ...state.groups, [jid]: patched } };
      });
      set({ error: null });
    } catch (err) {
      set({ error: err instanceof Error ? err.message : String(err) });
      throw err;
    }
  },
}));
