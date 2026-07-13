import { NavLink, Navigate, useParams } from 'react-router-dom';
import { Plug, Puzzle, Server } from 'lucide-react';

import { McpServersPage } from './McpServersPage';
import { PluginsPage } from './PluginsPage';
import { SkillsPage } from './SkillsPage';

const sections = [
  { key: 'skills', label: 'Skills', icon: Puzzle },
  { key: 'mcp', label: 'MCP', icon: Server },
  { key: 'plugins', label: 'Plugins', icon: Plug },
] as const;

export function CapabilitiesPage() {
  const { section } = useParams<{ section?: string }>();
  if (!section) return <Navigate to="/capabilities/skills" replace />;
  if (!sections.some((item) => item.key === section)) {
    return <Navigate to="/capabilities/skills" replace />;
  }

  return (
    <div className="min-h-full bg-background">
      <div className="sticky top-0 z-20 border-b border-border bg-background/95 px-4 py-3 backdrop-blur lg:px-6">
        <div className="mx-auto flex max-w-7xl items-center gap-2">
          <span className="mr-2 text-sm font-semibold text-foreground">
            能力
          </span>
          {sections.map(({ key, label, icon: Icon }) => (
            <NavLink
              key={key}
              to={`/capabilities/${key}`}
              className={({ isActive }) =>
                `inline-flex min-h-9 items-center gap-1.5 rounded-lg px-3 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                  isActive
                    ? 'bg-brand-50 font-medium text-primary'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                }`
              }
            >
              <Icon className="size-4" />
              {label}
            </NavLink>
          ))}
        </div>
      </div>

      {section === 'skills' && <SkillsPage />}
      {section === 'mcp' && <McpServersPage />}
      {section === 'plugins' && <PluginsPage />}
    </div>
  );
}
