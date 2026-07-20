export interface ModelTokenUsage {
  inputTokens?: number;
  outputTokens?: number;
  reasoningTokens?: number;
  costUSD?: number;
}

export interface TokenUsagePayload {
  inputTokens?: number;
  outputTokens?: number;
  cacheReadInputTokens?: number;
  cacheCreationInputTokens?: number;
  reasoningTokens?: number;
  costUSD?: number;
  durationMs?: number;
  numTurns?: number;
  modelUsage?: Record<string, ModelTokenUsage>;
}

export interface TokenBreakdown {
  inputTokens: number;
  outputTokens: number;
  cacheReadInputTokens: number;
  cacheCreationInputTokens: number;
  reasoningTokens: number;
  totalTokens: number;
}

function tokenCount(value: number | undefined): number {
  return value !== undefined && Number.isFinite(value) && value > 0 ? value : 0;
}

export function parseTokenUsage(json: string): TokenUsagePayload | null {
  try {
    const parsed: unknown = JSON.parse(json);
    return parsed !== null && typeof parsed === 'object'
      ? (parsed as TokenUsagePayload)
      : null;
  } catch {
    return null;
  }
}

/**
 * The root five token classes are the authoritative per-message totals. A
 * per-model breakdown can contain internal/router models and must never replace
 * these totals.
 */
export function getAuthoritativeTokenBreakdown(
  usage: TokenUsagePayload,
): TokenBreakdown {
  const inputTokens = tokenCount(usage.inputTokens);
  const outputTokens = tokenCount(usage.outputTokens);
  const cacheReadInputTokens = tokenCount(usage.cacheReadInputTokens);
  const cacheCreationInputTokens = tokenCount(usage.cacheCreationInputTokens);
  const reasoningTokens = tokenCount(usage.reasoningTokens);

  return {
    inputTokens,
    outputTokens,
    cacheReadInputTokens,
    cacheCreationInputTokens,
    reasoningTokens,
    totalTokens:
      inputTokens +
      outputTokens +
      cacheReadInputTokens +
      cacheCreationInputTokens +
      reasoningTokens,
  };
}

export function getPrimaryModelUsage(
  usage: TokenUsagePayload,
): [string, ModelTokenUsage] | null {
  const models = Object.entries(usage.modelUsage ?? {});
  if (models.length === 0) return null;

  return models.reduce((primary, candidate) =>
    tokenCount(candidate[1].costUSD) > tokenCount(primary[1].costUSD)
      ? candidate
      : primary,
  );
}
