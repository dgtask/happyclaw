const STANDARD_CONTEXT_WINDOW = 200_000;
const EXTENDED_CONTEXT_WINDOW = 1_000_000;

/** Claude Agent SDK uses the [1m] model suffix to request extended context. */
export function resolveModelContextWindow(model: string): number {
  return /(\[1m\])+$/i.test(model.trim())
    ? EXTENDED_CONTEXT_WINDOW
    : STANDARD_CONTEXT_WINDOW;
}

/** Convert a model-relative compact percentage into the SDK token setting. */
export function resolveAutoCompactWindow(
  model: string,
  percentage: number,
): number | undefined {
  if (!Number.isInteger(percentage) || percentage < 50 || percentage > 90) {
    return undefined;
  }
  return Math.round((resolveModelContextWindow(model) * percentage) / 100);
}
