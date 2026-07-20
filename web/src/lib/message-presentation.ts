import type { Message } from '../stores/chat';

const LEGACY_INTERRUPTED_SUFFIX = /\n\n---\n\*⚠️ 已中断\*\s*$/;
const LEGACY_STOPPED_SUFFIX = /(?:^|\n\n)---\n\*已停止\*\s*$/;

/**
 * Older intentional stops and steers were persisted with a warning footer.
 * Present those normal user-directed transitions without failure styling,
 * while retaining warnings for genuine error/crash recovery rows.
 */
export function getPresentedMessageContent(
  message: Pick<Message, 'content' | 'source_kind' | 'finalization_reason'>,
): string {
  if (
    message.source_kind !== 'interrupt_partial' ||
    message.finalization_reason !== 'interrupted'
  ) {
    return message.content;
  }

  return message.content
    .replace(
      '<summary>💭 Reasoning (已中断)</summary>',
      '<summary>💭 Reasoning</summary>',
    )
    .replace(LEGACY_INTERRUPTED_SUFFIX, '')
    .replace(LEGACY_STOPPED_SUFFIX, '')
    .trimEnd();
}
