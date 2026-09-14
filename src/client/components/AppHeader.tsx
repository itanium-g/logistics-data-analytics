import type { RefObject } from "react";
import type { MetaResponse } from "../../shared/contracts.ts";
import type { WorkspaceView } from "../app/App.tsx";
import { useTheme } from "../app/theme.tsx";
import { Icon } from "./Icons.tsx";

export interface AppHeaderProps {
  readonly view: WorkspaceView;
  readonly meta: MetaResponse | null;
  readonly assistantOpen: boolean;
  readonly sidebarCollapsed: boolean;
  readonly sidebarForcedRail: boolean;
  readonly assistantTriggerRef?: RefObject<HTMLButtonElement | null>;
  readonly navigationTriggerRef?: RefObject<HTMLButtonElement | null>;
  readonly onOpenNavigation: () => void;
  readonly onToggleAssistant: () => void;
}

export function AppHeader({
  view,
  meta,
  assistantOpen,
  sidebarCollapsed,
  sidebarForcedRail,
  assistantTriggerRef,
  navigationTriggerRef,
  onOpenNavigation,
  onToggleAssistant,
}: AppHeaderProps) {
  const { preference, setPreference } = useTheme();
  const currentTitle = view === "overview" ? "Overview" : "Forecasts";

  return (
    <header className="app-header">
      <div className="header-primary">
        <button ref={navigationTriggerRef} type="button" className="mobile-nav-trigger icon-button" onClick={onOpenNavigation} aria-label="Open navigation">
          <Icon name="menu" size={18} />
        </button>
        <div className="header-context">
          <span className="sr-only">Spaceship Logistics Analytics</span>
          <p className="header-kicker">Spaceship / Operations workspace</p>
          <strong>{currentTitle}</strong>
        </div>
      </div>

      <div className="header-actions">
        {meta !== null && (
          <span
            className="dataset-badge"
            title={`Imported ${meta.imported_at}; coverage ${meta.assumed_coverage.start} to ${meta.assumed_coverage.end}`}
          >
            <span className="status-dot" aria-hidden="true" />
            <span>Data {meta.data_version}</span>
            <span aria-hidden="true">·</span>
            <span>{meta.observed.row_count} records</span>
          </span>
        )}

        <label className="theme-control" htmlFor="theme-preference">
          <span className="theme-control-label">Theme</span>
          <select
            id="theme-preference"
            aria-label="Theme preference"
            value={preference}
            onChange={(event) => setPreference(event.target.value as typeof preference)}
          >
            <option value="system">System</option>
            <option value="light">Light</option>
            <option value="dark">Dark</option>
          </select>
        </label>

        <button
          ref={assistantTriggerRef}
          type="button"
          className={`assistant-trigger${assistantOpen ? " is-open" : ""}`}
          aria-controls="ai-analyst-panel"
          aria-expanded={assistantOpen}
          onClick={onToggleAssistant}
          disabled={meta === null}
        >
          <Icon name="spark" size={15} />
          <span className="assistant-trigger-label">AI Analyst</span>
          <span className="assistant-trigger-short">Ask</span>
          <span className="trigger-state">{assistantOpen ? "Open" : "Ask"}</span>
        </button>
      </div>

      <span className="sr-only" aria-live="polite">
        {sidebarForcedRail && sidebarCollapsed ? "Sidebar compact while AI Analyst is docked." : ""}
      </span>
    </header>
  );
}
