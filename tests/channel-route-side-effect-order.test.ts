import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, test } from 'vitest';

function source(file: string) {
  return fs.readFileSync(path.join(process.cwd(), 'src', file), 'utf8');
}

function expectRouteBeforeSideEffects(
  body: string,
  routeMarker: string,
  markers: string[],
) {
  const route = body.indexOf(routeMarker);
  expect(route).toBeGreaterThan(-1);
  for (const marker of markers) {
    const sideEffect = body.indexOf(marker, route);
    expect(sideEffect, marker).toBeGreaterThan(route);
  }
}

describe('stale routes are rejected before connector side effects', () => {
  test('Discord resolves before registration, downloads, and persistence', () => {
    expectRouteBeforeSideEffects(
      source('discord.ts'),
      'const resolvedRoute =',
      [
        'opts.onNewChat(jid, chatName)',
        'await downloadAttachment(',
        'storeMessageDirect(',
      ],
    );
  });

  test('WhatsApp resolves before registration, downloads, and persistence', () => {
    expectRouteBeforeSideEffects(
      source('whatsapp.ts'),
      'const resolvedRoute =',
      [
        'opts.onNewChat(chatJid, chatName)',
        'await tryHandleMediaMessage(',
        'storeMessageDirect(',
      ],
    );
  });

  test('Feishu resolves before registration, downloads, and persistence', () => {
    expectRouteBeforeSideEffects(source('feishu.ts'), 'const admittedRoute =', [
      'onNewChat?.(chatJid, resolvedChatName)',
      'await downloadFeishuImage(',
      'storeMessageDirect(',
    ]);
  });
});
