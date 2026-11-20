import { createContext, useCallback, useContext, useEffect, useId, useRef, useState } from "react";

/* ---------- Buttons ---------- */
type Variant = "primary" | "secondary" | "ghost" | "danger";
export function Button({ variant = "secondary", size, busy, className = "", children, ...rest }:
  React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: "sm"; busy?: boolean }) {
  return (
    <button type="button" {...rest} disabled={rest.disabled || busy} aria-busy={busy || undefined}
      className={`btn btn--${variant}${size ? ` btn--${size}` : ""} ${className}`}>
      {busy && <span className="spinner" aria-hidden="true" />}
      {children}
    </button>
  );
}

/* ---------- Form fields ---------- */
interface FieldProps {
  label: string;
  hint?: string;
  error?: string | null;
  children: (props: { id: string; "aria-describedby"?: string; "aria-invalid"?: boolean }) => React.ReactNode;
  className?: string;
}
export function Field({ label, hint, error, children, className = "" }: FieldProps) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errId = error ? `${id}-err` : undefined;
  return (
    <div className={`field ${className}`}>
      <label htmlFor={id}>{label}</label>
      {children({ id, "aria-describedby": [hintId, errId].filter(Boolean).join(" ") || undefined, "aria-invalid": error ? true : undefined })}
      {hint && <p className="field__hint" id={hintId}>{hint}</p>}
      {error && <p className="field__error" id={errId}>{error}</p>}
    </div>
  );
}

/* ---------- Layout bits ---------- */
export function PageHeader({ title, subtitle, actions, back }: { title: string; subtitle?: React.ReactNode; actions?: React.ReactNode; back?: React.ReactNode }) {
  return (
    <header className="page-header">
      {back && <div className="page-header__back">{back}</div>}
      <div className="page-header__row">
        <div>
          <h1>{title}</h1>
          {subtitle && <p className="page-header__sub">{subtitle}</p>}
        </div>
        {actions && <div className="page-header__actions">{actions}</div>}
      </div>
    </header>
  );
}

export function Panel({ title, description, actions, children, id }: { title?: string; description?: React.ReactNode; actions?: React.ReactNode; children: React.ReactNode; id?: string }) {
  return (
    <section className="panel" aria-labelledby={title ? `${id ?? title}-h` : undefined}>
      {(title || actions) && (
        <div className="panel__head">
          <div>
            {title && <h2 id={`${id ?? title}-h`}>{title}</h2>}
            {description && <p className="panel__desc">{description}</p>}
          </div>
          {actions && <div className="panel__actions">{actions}</div>}
        </div>
      )}
      {children}
    </section>
  );
}

export function Badge({ tone = "neutral", children }: { tone?: "neutral" | "good" | "warn" | "bad" | "info"; children: React.ReactNode }) {
  return <span className={`badge badge--${tone}`}>{children}</span>;
}

export function Empty({ title, children, action }: { title: string; children?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="empty">
      <p className="empty__title">{title}</p>
      {children && <p className="empty__body">{children}</p>}
      {action}
    </div>
  );
}

export function Loading({ label = "Loading…" }: { label?: string }) {
  return <p className="loading" role="status"><span className="spinner" aria-hidden="true" /> {label}</p>;
}

export function ErrorNote({ error, onRetry }: { error: string; onRetry?: () => void }) {
  return (
    <div className="error-note" role="alert">
      <p>{error}</p>
      {onRetry && <Button size="sm" onClick={onRetry}>Try again</Button>}
    </div>
  );
}

/* ---------- Confirm dialog ---------- */
export function Confirm({ open, title, body, confirmLabel, tone = "primary", busy, onConfirm, onCancel }: {
  open: boolean; title: string; body: React.ReactNode; confirmLabel: string; tone?: "primary" | "danger";
  busy?: boolean; onConfirm: () => void; onCancel: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal?.();
    if (!open && d.open) d.close?.();
  }, [open]);
  return (
    <dialog ref={ref} className="dialog" onClose={onCancel} aria-labelledby="confirm-title">
      <h2 id="confirm-title">{title}</h2>
      <div className="dialog__body">{body}</div>
      <div className="dialog__actions">
        <Button onClick={onCancel} disabled={busy}>Cancel</Button>
        <Button variant={tone} onClick={onConfirm} busy={busy}>{confirmLabel}</Button>
      </div>
    </dialog>
  );
}

/* ---------- Toasts ---------- */
interface Toast { id: number; text: string; tone: "good" | "bad" }
const ToastCtx = createContext<(text: string, tone?: Toast["tone"]) => void>(() => {});
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((text: string, tone: Toast["tone"] = "good") => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, text, tone }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), tone === "bad" ? 7000 : 3500);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {toasts.map((t) => <p key={t.id} className={`toast toast--${t.tone}`}>{t.text}</p>)}
      </div>
    </ToastCtx.Provider>
  );
}
export const useToast = () => useContext(ToastCtx);

/* ---------- Dates ---------- */
export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = iso.length <= 10 ? new Date(iso + "T00:00:00") : new Date(iso);
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}
export function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString(undefined, { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
}
export function relTime(iso: string | null | undefined): string {
  if (!iso) return "never";
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  if (s < 86400 * 30) return `${Math.round(s / 86400)} days ago`;
  return fmtDate(iso);
}
