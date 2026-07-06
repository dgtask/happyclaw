import { sdkQuery } from './sdk-query.js';
import { getClaudeProviderConfig } from './runtime-config.js';

export interface AgentProfileDraft {
  name: string;
  identity_prompt: string;
}

const MAX_AGENT_NAME_LENGTH = 80;
const MAX_IDENTITY_PROMPT_LENGTH = 20_000;

function hasUsableClaudeProvider(): boolean {
  const config = getClaudeProviderConfig();
  return !!(
    config.anthropicApiKey ||
    config.anthropicAuthToken ||
    config.claudeCodeOauthToken ||
    config.claudeOAuthCredentials
  );
}

function buildAgentProfileDraftPrompt(description: string): string {
  return `你是 HappyClaw 的 Agent 配置生成器。用户会用一段自然语言描述想要的 Agent，你需要把它解析成当前系统可保存的 AgentProfile 配置。

用户描述：
<description>
${description}
</description>

请只返回一个 JSON 对象，不要返回 Markdown、解释或额外文字。字段如下：
- "name": string，Agent 名称，中文优先，简短清晰，不超过 20 个汉字或 40 个英文字符。
- "identity_prompt": string，写给 Agent 的身份提示词。需要直接可作为系统身份注入，使用第二人称或祈使句，明确角色、目标、工作方式、输出偏好、边界和必要约束。

生成要求：
- 不要虚构系统当前不具备的权限、工具或外部账号能力。
- 如果用户提到技能、工具或知识范围，把它们转化为行为边界和工作偏好写入 identity_prompt。
- identity_prompt 应该具体、可执行，避免空泛形容词。
- 默认用中文；如果用户明确要求英文 Agent，则用英文。
- 只返回 JSON。`;
}

function parseJsonObject(raw: string): unknown | null {
  const candidates: string[] = [raw.trim()];
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) candidates.push(fenced[1].trim());

  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start >= 0 && end > start) {
    candidates.push(raw.slice(start, end + 1));
  }

  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate);
    } catch {
      // try next candidate
    }
  }

  return null;
}

function normalizeText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeDraft(parsed: unknown): AgentProfileDraft | null {
  if (!parsed || typeof parsed !== 'object') return null;
  const source = parsed as Record<string, unknown>;
  const name = normalizeText(source.name).slice(0, MAX_AGENT_NAME_LENGTH).trim();
  const identityPrompt = normalizeText(source.identity_prompt)
    .slice(0, MAX_IDENTITY_PROMPT_LENGTH)
    .trim();

  if (!name || !identityPrompt) return null;
  return { name, identity_prompt: identityPrompt };
}

export async function generateAgentProfileDraft(
  description: string,
): Promise<AgentProfileDraft> {
  const trimmed = description.trim();
  if (!trimmed) {
    throw new Error('请输入 Agent 描述');
  }
  if (!hasUsableClaudeProvider()) {
    throw new Error('Claude 提供商未配置，请先配置 Claude 后再生成');
  }

  const result = await sdkQuery(buildAgentProfileDraftPrompt(trimmed), {
    model: process.env.RECALL_MODEL || undefined,
    timeout: 45_000,
  });
  if (!result) {
    throw new Error('AI 解析失败，请重试或手动填写');
  }

  const parsed = parseJsonObject(result);
  const draft = normalizeDraft(parsed);
  if (!draft) {
    throw new Error('AI 返回格式异常，请重试或手动填写');
  }
  return draft;
}
