# Agent-first Architecture Plan

## Executive Summary

HappyClaw is currently halfway between two models:

- Current persisted workspace model: workspace/group is the top-level runtime container.
- New target model: Agent is the top-level product entity, and each Agent owns multiple workspaces.

The correct target hierarchy is:

```text
Agent
  - identity prompt
  - Claude preset inclusion policy
  - skill policy
  - channel mounts
  - workspaces
      - runtime isolation boundary
      - main session
      - optional sub-agent/task sessions
```

The highest-risk migration point is runtime identity consistency. A warm runner captures
`containerInput.agentProfile` at process start. If the Agent prompt or preset policy changes,
or if a workspace switches to a different Agent, IPC-injected messages can still be processed
by the old in-memory runner. This must be fixed before deeper schema migration.

## Current Findings

### Backend

- `agent_profiles` already represents the new top-level Agent identity.
- `workspace_agent_profiles` maps a workspace folder to an AgentProfile.
- The container runner already receives Agent identity metadata and injects it into the
  system prompt.
- Session identity metadata is already stored and checked through profile id/hash/version.
- `registered_groups` still mixes workspace state, IM channel state, and routing state.
- `sessions` are still keyed by workspace folder plus old sub-agent id.
- The old `agents` table is still the conversation/task/spawn-agent model, not the new
  top-level Agent concept.
- Skills are still workspace/user/project scoped, not Agent-owned.

### Frontend

- The sidebar has started grouping workspaces by Agent.
- Agent settings exist as an independent area.
- Workspace creation can select an Agent.
- Some copy and mental model still remain workspace-first.
- Channel binding screens still route around workspace/session concepts rather than an
  Agent-owned mount model.

## Target Domain Model

### Agent

Agent is the product-level actor.

Fields:

- `id`
- `owner_user_id`
- `name`
- `identity_prompt`
- `include_claude_preset`
- `identity_hash`
- `version`
- `status`
- `is_default`

Future fields:

- skill policy
- MCP policy
- model/provider policy
- channel mount policy
- default workspace template

### Workspace

Workspace is an isolation boundary derived from an Agent.

Responsibilities:

- filesystem isolation
- host or container execution mode
- main session
- runtime metadata
- optional linked IM/web channels

Compatibility mapping:

- existing `registered_groups.folder` is the workspace id/folder key for now.
- existing `workspace_agent_profiles` is the bridge from workspace to Agent.

### Session

Each workspace has one main session by default.

Additional sessions can exist for:

- spawned sub-agents
- scheduled tasks
- channel-specific conversations, when needed

Session identity must include:

- AgentProfile id
- identity hash
- version

### Channel Mount

A channel is an external message entry point. In the target model it is mounted under an Agent,
then routed to a workspace/session.

Target table:

```text
agent_channel_mounts
  - id
  - owner_user_id
  - agent_profile_id
  - channel_type
  - source_jid / source_channel_id
  - workspace_id
  - session_selector
  - reply_policy
  - activation_policy
  - status
```

Compatibility:

- keep existing `registered_groups.target_agent_id`, `target_main_jid`, and `reply_policy`
  until the mount table is fully read/write enabled.

## Prompt Composition Semantics

Agent identity should be a first-class prompt layer.

If `include_claude_preset = true`:

```text
Claude Code preset
+ Agent identity prompt
+ workspace/context prompt
+ message history
```

If `include_claude_preset = false`:

```text
Agent identity prompt
+ workspace/context prompt
+ message history
```

This switch is user-controlled when creating or editing an Agent.

## Migration Plan

### Phase 0: Runtime Consistency

Goal: any Agent identity change must not leak into a warm runner with stale prompt state.

Implementation:

- When an Agent identity prompt or Claude preset switch changes, stop all warm runners for
  workspaces currently attached to that Agent.
- When a workspace switches to another Agent, stop all warm runners for that workspace.
- Do not eagerly delete session rows in this path. The existing session identity mismatch
  checks should perform the reset on the next cold run and preserve the existing recent-history
  injection behavior.

### Phase 1: Agent-first Product Surface

Goal: make Agent the first-level user mental model.

Implementation:

- Sidebar exposes Agent management as a primary item.
- Workspaces are displayed under their owning Agent.
- Workspace creation starts from an Agent selection.
- Remove workspace lists from Agent settings details unless the screen is explicitly about
  workspace assignment.

### Phase 2: Workspace Compatibility Schema

Goal: introduce explicit workspace tables without breaking existing data.

Implementation:

- Add `workspaces` as the canonical workspace metadata table.
- Backfill from web `registered_groups`.
- Keep writing `registered_groups` for compatibility until all readers move.
- Add `workspace_sessions` as the canonical main-session and child-session metadata table.

### Phase 3: Agent-owned Channel Mounts

Goal: move IM/web channel routing from project/workspace-level state to Agent-level mounts.

Implementation:

- Add `agent_channel_mounts`.
- Backfill from current binding fields.
- Write both old fields and new mount records.
- Migrate route resolution to mount-first, old-field fallback.
- Update settings UI to show channels under Agent, then target workspace/session.

### Phase 4: Agent-owned Skills

Goal: each Agent can control its own skills.

Implementation:

- Add Agent skill assignment table.
- Define inheritance order:
  `system defaults -> user defaults -> Agent policy -> workspace override`.
- Expose skill enable/disable controls on Agent settings.
- Inject enabled skill policy into runner input.

## Immediate Acceptance Criteria

- Editing an Agent identity prompt invalidates warm runners for attached workspaces.
- Switching a workspace to another Agent invalidates warm runners for that workspace.
- Next message after identity change uses the updated prompt policy.
- Existing session mismatch reset behavior remains responsible for session row cleanup.
- Agent settings remains independent from workspace listing.
- Build and tests pass.

