import type { ReactNode } from "react";

export function StateBox(props: {
  loading?: boolean;
  error?: string | null;
  empty?: boolean;
  emptyText?: string;
  children?: ReactNode;
}) {
  if (props.loading) {
    return <div className="card state-box"><p className="muted">Yuklanmoqda…</p></div>;
  }
  if (props.error) {
    return (
      <div className="card state-box state-error">
        <p>{props.error}</p>
      </div>
    );
  }
  if (props.empty) {
    return (
      <div className="card state-box">
        <p className="muted">{props.emptyText || "Ma’lumot yo‘q"}</p>
      </div>
    );
  }
  return <>{props.children}</>;
}

export function Badge(props: { tone?: "ok" | "warn" | "danger" | "neutral"; children: ReactNode }) {
  const tone = props.tone || "neutral";
  return <span className={`badge badge-${tone}`}>{props.children}</span>;
}

export function PageHeader(props: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="page-header">
      <div>
        <h1>{props.title}</h1>
        {props.subtitle ? <p className="muted">{props.subtitle}</p> : null}
      </div>
      {props.actions ? <div className="page-actions">{props.actions}</div> : null}
    </div>
  );
}
