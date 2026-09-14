import { useRef, type RefObject } from "react";
import type { MetaResponse } from "../../shared/contracts.ts";
import type { WorkspaceView } from "../App.tsx";
import { Icon } from "./Icons.tsx";
import { ModalDialog } from "./ModalDialog.tsx";

export interface AppSidebarProps {
  readonly view: WorkspaceView;
  readonly collapsed: boolean;
  readonly forcedRail: boolean;
  readonly meta: MetaResponse | null;
  readonly desktop: boolean;
  readonly mobileOpen: boolean;
  readonly onToggle: () => void;
  readonly onNavigate: (view: WorkspaceView) => void;
  readonly onCloseMobile: () => void;
  readonly returnFocusRef?: RefObject<HTMLButtonElement | null>;
}

function SidebarContents({
  view,
  collapsed,
  forcedRail,
  meta,
  onToggle,
  onNavigate,
}: Omit<AppSidebarProps, "desktop" | "mobileOpen" | "onCloseMobile">) {
  const forcedRailId = "sidebar-rail-explanation";

  return (
    <aside
      className={`app-sidebar${collapsed ? " is-collapsed" : ""}${forcedRail ? " is-forced-rail" : ""}`}
      aria-label="Primary navigation"
    >
      <div className="sidebar-brand-block">
        <a className="sidebar-brand" href="#overview" aria-label="Spaceship Logistics Analytics overview">
          <span className="brand-mark" aria-hidden="true">
            <Icon name="activity" size={18} />
          </span>
          <span className="sidebar-brand-copy">
            <strong>Spaceship Logistics Analytics</strong>
            <span>Operations workspace</span>
          </span>
        </a>
        <button
          type="button"
          className="sidebar-toggle icon-button"
          onClick={onToggle}
          disabled={forcedRail}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          aria-describedby={forcedRail ? forcedRailId : undefined}
          title={forcedRail ? "Compact while AI Analyst is docked" : undefined}
        >
          <Icon name={collapsed ? "chevron-right" : "chevron-left"} size={16} />
        </button>
      </div>

      {forcedRail && (
        <p id={forcedRailId} className="sr-only">
          The sidebar is temporarily compact while AI Analyst is docked at this width. Close AI Analyst to restore the saved sidebar preference.
        </p>
      )}

      <nav className="sidebar-nav" aria-label="Workspace">
        <p className="sidebar-section-label">Workspace</p>
        <a
          href="#overview"
          className={view === "overview" ? "is-active" : ""}
          aria-current={view === "overview" ? "page" : undefined}
          onClick={() => onNavigate("overview")}
        >
          <Icon name="grid" size={17} />
          <span>Overview</span>
        </a>
        <a
          href="#forecasts"
          className={view === "forecasts" ? "is-active" : ""}
          aria-current={view === "forecasts" ? "page" : undefined}
          onClick={() => onNavigate("forecasts")}
        >
          <Icon name="chart" size={17} />
          <span>Forecasts</span>
        </a>
      </nav>

      <div className="sidebar-spacer" />

      <div className="sidebar-dataset" aria-label="Imported dataset metadata">
        <p className="sidebar-section-label">Imported dataset</p>
        {meta === null ? (
          <span>Loading metadata…</span>
        ) : (
          <>
            <strong>Data {meta.data_version}</strong>
            <span>{meta.observed.row_count} source records</span>
            <span>{meta.observed.order_date_min} — {meta.observed.order_date_max}</span>
          </>
        )}
      </div>
    </aside>
  );
}

export function AppSidebar(props: AppSidebarProps) {
  const mobileCloseRef = useRef<HTMLButtonElement>(null);
  const contents = (
    <SidebarContents
      view={props.view}
      collapsed={props.desktop ? props.collapsed : false}
      forcedRail={props.desktop && props.forcedRail}
      meta={props.meta}
      onToggle={props.onToggle}
      onNavigate={props.onNavigate}
    />
  );

  if (props.desktop) return contents;

  return (
    <ModalDialog
      open={props.mobileOpen}
      headingId="mobile-sidebar-heading"
      initialFocusRef={mobileCloseRef}
      returnFocusRef={props.returnFocusRef}
      onDismiss={props.onCloseMobile}
      className="navigation-dialog"
    >
      <div className="mobile-dialog-header">
        <h2 id="mobile-sidebar-heading">Navigation</h2>
        <button ref={mobileCloseRef} type="button" className="icon-button" onClick={props.onCloseMobile} aria-label="Close navigation">
          <Icon name="close" size={17} />
        </button>
      </div>
      {contents}
    </ModalDialog>
  );
}
