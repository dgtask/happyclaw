import { useEffect, useMemo, useState } from 'react';
import { Bot, Loader2, Plus, RefreshCw, Save, Trash2, Wand2, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { useAgentProfilesStore } from '../stores/agent-profiles';

export function AgentProfilesPage() {
  const {
    profiles,
    loading,
    error,
    loadProfiles,
    generateProfileDraft,
    createProfile,
    updateProfile,
    deleteProfile,
  } = useAgentProfilesStore();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draftMode, setDraftMode] = useState(false);
  const [name, setName] = useState('');
  const [identityPrompt, setIdentityPrompt] = useState('');
  const [includeClaudePreset, setIncludeClaudePreset] = useState(true);
  const [saving, setSaving] = useState(false);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [generatingDraft, setGeneratingDraft] = useState(false);
  const [createDescription, setCreateDescription] = useState('');

  useEffect(() => {
    void loadProfiles();
  }, [loadProfiles]);

  useEffect(() => {
    if (draftMode) return;
    if (selectedId && profiles.some((profile) => profile.id === selectedId)) {
      return;
    }
    const defaultProfile = profiles.find((profile) => profile.is_default) ?? profiles[0];
    if (defaultProfile) setSelectedId(defaultProfile.id);
  }, [draftMode, profiles, selectedId]);

  const selected = useMemo(
    () => profiles.find((profile) => profile.id === selectedId) ?? null,
    [profiles, selectedId],
  );

  useEffect(() => {
    if (draftMode) return;
    if (!selected) {
      setName('');
      setIdentityPrompt('');
      setIncludeClaudePreset(true);
      return;
    }
    setName(selected.name);
    setIdentityPrompt(selected.identity_prompt);
    setIncludeClaudePreset(selected.include_claude_preset);
  }, [draftMode, selected]);

  const dirty =
    !draftMode &&
    !!selected &&
    (name.trim() !== selected.name ||
      identityPrompt.trim() !== selected.identity_prompt ||
      includeClaudePreset !== selected.include_claude_preset);

  const getErrorMessage = (err: unknown, fallback: string) => {
    if (err instanceof Error) return err.message;
    if (err && typeof err === 'object' && 'message' in err) {
      const message = (err as { message?: unknown }).message;
      if (typeof message === 'string' && message) return message;
    }
    return fallback;
  };

  const handleGenerateDraft = async () => {
    const description = createDescription.trim();
    if (!description) return;
    setGeneratingDraft(true);
    try {
      const draft = await generateProfileDraft(description);
      setDraftMode(true);
      setSelectedId(null);
      setName(draft.name);
      setIdentityPrompt(draft.identity_prompt);
      setIncludeClaudePreset(true);
      toast.success('已生成 Agent 配置');
    } catch (err) {
      toast.error(getErrorMessage(err, '生成失败'));
    } finally {
      setGeneratingDraft(false);
    }
  };

  const handleBlankDraft = () => {
    setDraftMode(true);
    setSelectedId(null);
    setName('');
    setIdentityPrompt('');
    setIncludeClaudePreset(true);
  };

  const handleDiscardDraft = () => {
    setDraftMode(false);
    const fallback = profiles.find((profile) => profile.is_default) ?? profiles[0];
    setSelectedId(fallback?.id ?? null);
  };

  const handleCreate = async () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    setCreating(true);
    try {
      const profile = await createProfile({
        name: trimmed,
        identity_prompt: identityPrompt.trim(),
        include_claude_preset: includeClaudePreset,
      });
      setCreateDescription('');
      setDraftMode(false);
      setSelectedId(profile.id);
      toast.success('已创建 Agent');
    } catch (err) {
      toast.error(getErrorMessage(err, '创建失败'));
    } finally {
      setCreating(false);
    }
  };

  const handleSave = async () => {
    if (!selected || !name.trim()) return;
    setSaving(true);
    try {
      const profile = await updateProfile(selected.id, {
        name: name.trim(),
        identity_prompt: identityPrompt.trim(),
        include_claude_preset: includeClaudePreset,
      });
      setSelectedId(profile.id);
      toast.success('已保存');
    } catch (err) {
      toast.error(getErrorMessage(err, '保存失败'));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!selected || selected.is_default) return;
    if (!confirm(`确认删除 Agent「${selected.name}」？`)) return;
    setDeleting(true);
    try {
      await deleteProfile(selected.id);
      const fallback = profiles.find((profile) => profile.is_default);
      setSelectedId(fallback?.id ?? null);
      toast.success('已删除');
    } catch (err) {
      toast.error(getErrorMessage(err, '删除失败'));
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="min-h-full bg-background p-4 lg:p-8">
      <div className="mx-auto max-w-7xl space-y-4">
        <Card>
          <CardContent>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex min-w-0 items-center gap-3">
                <div className="rounded-lg bg-brand-100 p-2">
                  <Bot className="h-5 w-5 text-primary" />
                </div>
                <div className="min-w-0">
                  <h1 className="text-2xl font-bold text-foreground">Agent</h1>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <span>{profiles.length} 个 Agent</span>
                  </div>
                </div>
              </div>
              <Button variant="outline" size="sm" onClick={loadProfiles} disabled={loading}>
                <RefreshCw className={loading ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} />
                刷新
              </Button>
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[320px_1fr]">
          <Card>
            <CardContent>
              <div className="mb-4 space-y-3 rounded-lg border bg-muted/20 p-3">
                <Textarea
                  value={createDescription}
                  onChange={(event) => setCreateDescription(event.target.value)}
                  className="min-h-[96px] resize-y text-sm leading-5"
                  placeholder="用一段话描述你想要的 Agent，例如：帮我做代码评审，重点看架构风险、测试缺口和上线风险，回答要直接给结论。"
                />
                <Button
                  variant="outline"
                  className="w-full justify-center"
                  onClick={handleGenerateDraft}
                  disabled={generatingDraft || !createDescription.trim()}
                >
                  {generatingDraft ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Wand2 className="h-4 w-4" />
                  )}
                  AI 生成并填入右侧
                </Button>
                <Button
                  variant="ghost"
                  className="w-full justify-center"
                  onClick={handleBlankDraft}
                >
                  <Plus className="h-4 w-4" />
                  新建空白 Agent
                </Button>
              </div>

              <div className="space-y-2">
                {draftMode && (
                  <button
                    className="w-full rounded-lg border border-primary bg-brand-50 px-3 py-2 text-left transition-colors"
                    onClick={() => setDraftMode(true)}
                  >
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="truncate text-sm font-medium text-foreground">
                        {name.trim() || '新 Agent 草稿'}
                      </span>
                      <Badge variant="secondary">草稿</Badge>
                    </div>
                  </button>
                )}
                {loading && profiles.length === 0 ? (
                  <div className="flex justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin text-primary" />
                  </div>
                ) : error ? (
                  <div className="py-4 text-center text-sm text-error">{error}</div>
                ) : (
                  profiles.map((profile) => {
                    const active = profile.id === selectedId;
                    return (
                      <button
                        key={profile.id}
                        onClick={() => {
                          setDraftMode(false);
                          setSelectedId(profile.id);
                        }}
                        className={`w-full rounded-lg border px-3 py-2 text-left transition-colors ${
                          active && !draftMode
                            ? 'border-primary bg-brand-50'
                            : 'border-border hover:bg-muted/50'
                        }`}
                      >
                        <div className="flex min-w-0 items-center gap-2">
                          <span className="truncate text-sm font-medium text-foreground">
                            {profile.name}
                          </span>
                          {profile.is_default && <Badge variant="secondary">默认</Badge>}
                          <span className="text-[11px] text-muted-foreground">v{profile.version}</span>
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent>
              {!selected && !draftMode ? (
                <div className="flex min-h-[420px] items-center justify-center text-sm text-muted-foreground">
                  选择一个 Agent
                </div>
              ) : (
                <div className="space-y-5">
                  <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start">
                    <div className="space-y-4">
                      <div>
                        <label className="mb-2 flex items-center gap-2 text-sm font-medium">
                          名称
                          {draftMode && <Badge variant="secondary">草稿</Badge>}
                        </label>
                        <Input value={name} onChange={(event) => setName(event.target.value)} />
                      </div>
                      <div>
                        <label className="mb-2 block text-sm font-medium">身份提示词</label>
                        <Textarea
                          value={identityPrompt}
                          onChange={(event) => setIdentityPrompt(event.target.value)}
                          className="min-h-[260px] resize-y font-mono text-sm leading-6"
                          placeholder="例如：你是一个偏产品架构的工程 Agent，回答时先明确边界，再给可执行方案。"
                        />
                      </div>
                      <div className="flex items-center justify-between gap-3 rounded-lg border bg-muted/20 px-3 py-3">
                        <div className="min-w-0">
                          <div className="text-sm font-medium text-foreground">
                            包含 Claude Code 原生提示词
                          </div>
                          <div className="mt-1 text-xs text-muted-foreground">
                            关闭后该 Agent 运行时只使用 HappyClaw 与 Agent 提示词
                          </div>
                        </div>
                        <Switch
                          checked={includeClaudePreset}
                          onCheckedChange={setIncludeClaudePreset}
                          aria-label="包含 Claude Code 原生提示词"
                        />
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2 lg:justify-end">
                      {draftMode ? (
                        <>
                          <Button onClick={handleCreate} disabled={creating || !name.trim()}>
                            {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                            创建 Agent
                          </Button>
                          <Button variant="outline" onClick={handleDiscardDraft}>
                            <X className="h-4 w-4" />
                            放弃草稿
                          </Button>
                        </>
                      ) : (
                        <>
                          <Button onClick={handleSave} disabled={!dirty || saving || !name.trim()}>
                            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                            保存
                          </Button>
                          <Button
                            variant="outline"
                            onClick={handleDelete}
                            disabled={!selected || selected.is_default || deleting}
                            className="text-error hover:bg-error-bg hover:text-error"
                          >
                            <Trash2 className="h-4 w-4" />
                            删除
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
