import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, test } from 'vitest';

const root = process.cwd();
const read = (relativePath: string) =>
  fs.readFileSync(path.join(root, relativePath), 'utf-8');

describe('settings information architecture', () => {
  test('keeps account, system, and administration scopes explicit', () => {
    const nav = read('web/src/components/settings/SettingsNav.tsx');

    expect(nav).toContain("label: '账户设置'");
    expect(nav).toContain("label: '系统配置'");
    expect(nav).toContain("label: '管理后台'");
    expect(nav).toContain("label: '关于 HappyClaw'");
    expect(nav).toContain("key: 'my-channels'");
    expect(nav).toContain("key: 'security'");
    expect(nav).toContain("key: 'main-agent'");
    expect(nav).toContain("key: 'host-integration'");
    expect(nav).toContain('min-h-0 flex-1 overflow-y-auto px-3 pb-28');
    expect(nav).toContain('SheetDescription');
    expect(nav).not.toMatch(
      /key: '(groups|agent-profiles|memory|skills|mcp-servers|plugins|usage)'/,
    );
  });

  test('moves product resources out of settings while preserving old links', () => {
    const app = read('web/src/App.tsx');
    const settings = read('web/src/pages/SettingsPage.tsx');

    expect(app).toContain('path="/capabilities/:section?"');
    expect(app).toContain('path="/usage"');
    expect(app).toContain('requiredPermission="manage_system_config"');
    expect(settings).toContain("skills: '/capabilities/skills'");
    expect(settings).toContain("'mcp-servers': '/capabilities/mcp'");
    expect(settings).toContain("plugins: '/capabilities/plugins'");
    expect(settings).toContain(
      "bindings: '/settings?tab=my-channels&view=bindings'",
    );
  });

  test('separates profile, device preferences, messaging, and security', () => {
    const profile = read('web/src/components/settings/ProfileSection.tsx');
    const preferences = read(
      'web/src/components/settings/PreferencesSection.tsx',
    );
    const channels = read(
      'web/src/components/settings/UserChannelsSection.tsx',
    );
    const security = read('web/src/components/settings/SecuritySection.tsx');

    expect(profile).not.toMatch(/密码|default_require_mention|桌面通知/);
    expect(preferences).toMatch(/当前设备|桌面通知|恢复上次页面/);
    expect(channels).toMatch(
      /新群默认响应方式|已接入会话|default_require_mention/,
    );
    expect(security).toMatch(/修改密码|登录设备|shortId|撤销这台设备/);
  });

  test('keeps admin-only host policy separate from runtime and automation', () => {
    const system = read(
      'web/src/components/settings/SystemSettingsSection.tsx',
    );
    const page = read('web/src/pages/SettingsPage.tsx');

    expect(system).toMatch(/scope: 'runtime'/);
    expect(system).toMatch(/scope: 'security'/);
    expect(system).toMatch(/scope: 'automation'/);
    expect(system).toMatch(/普通模型通常为 200K\s+上下文/);
    expect(system).toMatch(/\[1m\] 时按 1M 处理/);
    expect(system).toMatch(
      /当前目录同时作为提示词、规则、Skills 和 Plugin Marketplace\s+的来源/,
    );
    expect(page).toContain("currentUser?.role !== 'admin'");
  });

  test('uses accurate channel and provider safety semantics', () => {
    const bindings = read('web/src/components/settings/BindingsSection.tsx');
    const bindingRow = read('web/src/components/settings/ImBindingRow.tsx');
    const provider = read('web/src/components/settings/ProviderEditor.tsx');
    const settings = read('web/src/pages/SettingsPage.tsx');

    expect(bindings).toMatch(/解除发言者限制|不可恢复|解除绑定/);
    expect(bindingRow).toMatch(
      /消息响应方式|supports_owner_mention|require_mention/,
    );
    expect(provider).toContain('高级设置 · 自定义环境变量');
    expect(provider).toContain("balancingStrategy === 'weighted-round-robin'");
    expect(settings).toContain('toast.success(message)');
    expect(settings).toContain('toast.error(message)');
  });
});
