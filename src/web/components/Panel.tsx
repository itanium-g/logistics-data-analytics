import type { HTMLAttributes, ReactNode } from "react";

type PanelElement = "section" | "div" | "article";

export interface PanelProps extends HTMLAttributes<HTMLElement> {
  readonly as?: PanelElement;
  readonly eyebrow?: string;
  readonly title?: string;
  readonly titleId?: string;
  readonly headingAction?: ReactNode;
  readonly children: ReactNode;
}

/** Shared panel/header structure; analytical ownership stays with callers. */
export function Panel({
  as = "section",
  eyebrow,
  title,
  titleId,
  headingAction,
  className = "",
  children,
  ...rest
}: PanelProps) {
  const Element = as;
  return (
    <Element className={`panel panel-shell ${className}`.trim()} {...rest}>
      {(eyebrow !== undefined || title !== undefined || headingAction !== undefined) && (
        <div className="panel-heading">
          <div>
            {eyebrow !== undefined && <p className="eyebrow">{eyebrow}</p>}
            {title !== undefined && (
              <h2 id={titleId} className="panel-title">
                {title}
              </h2>
            )}
          </div>
          {headingAction !== undefined && <div className="panel-heading-action">{headingAction}</div>}
        </div>
      )}
      {children}
    </Element>
  );
}
