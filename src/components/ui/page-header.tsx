import type { ReactNode } from "react";

export function PageHeader({
  backHref,
  backLabel,
  title,
  description,
  status,
  actions,
}: Readonly<{
  backHref?: string;
  backLabel?: string;
  title: string;
  description?: string;
  status?: ReactNode;
  actions?: ReactNode;
}>) {
  return (
    <header className="page-header">
      <div className="page-header-copy">
        {backHref ? (
          <a className="back-link" href={backHref}>
            <span aria-hidden="true">←</span> {backLabel ?? "Back"}
          </a>
        ) : null}
        <div className="page-title-row">
          <div>
            <h1 className="page-title">{title}</h1>
            {description ? <p className="page-description">{description}</p> : null}
          </div>
          {status ? <div>{status}</div> : null}
        </div>
      </div>
      {actions ? <div className="page-header-actions">{actions}</div> : null}
    </header>
  );
}

export function SectionHeader({
  title,
  description,
  actions,
}: Readonly<{
  title: string;
  description?: string;
  actions?: ReactNode;
}>) {
  return (
    <div className="section-header">
      <div>
        <h2 className="section-title">{title}</h2>
        {description ? <p className="section-description">{description}</p> : null}
      </div>
      {actions ? <div>{actions}</div> : null}
    </div>
  );
}
