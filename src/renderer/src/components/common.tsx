import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import type { GameDb } from '../gamedata';

export function NumberField({
  value,
  onChange,
  min = -2_147_483_648,
  max = 2_147_483_647,
  step = 1,
  big = false,
  float = false,
  prefixIcon,
  className = '',
  disabled = false,
}: {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  big?: boolean;
  float?: boolean;
  prefixIcon?: string | null;
  className?: string;
  disabled?: boolean;
}): JSX.Element {
  const fmt = (v: number): string => (float ? String(Math.round(v * 1000) / 1000) : String(Math.round(v)));
  const [text, setText] = useState(fmt(value));
  useEffect(() => setText(fmt(value)), [value, float]);
  const commit = (raw: string): void => {
    const n = Number(raw.replace(/[\s,]/g, '').trim());
    if (Number.isNaN(n)) {
      setText(fmt(value));
      return;
    }
    const clamped = Math.max(min, Math.min(max, float ? n : Math.round(n)));
    setText(fmt(clamped));
    if (clamped !== value) onChange(clamped);
  };
  const bump = (d: number): void => onChange(Math.max(min, Math.min(max, value + d)));
  return (
    <div className={`num ${big ? 'big' : ''} ${disabled ? 'disabled' : ''} ${className}`}>
      {prefixIcon && (
        <span className="prefix">
          <img src={prefixIcon} alt="" />
        </span>
      )}
      <input
        type="text"
        inputMode="decimal"
        value={text}
        disabled={disabled}
        onChange={(e) => setText(e.target.value)}
        onBlur={(e) => commit(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          if (e.key === 'ArrowUp') {
            e.preventDefault();
            bump(step * (e.shiftKey ? 10 : 1));
          }
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            bump(-step * (e.shiftKey ? 10 : 1));
          }
        }}
      />
      <button type="button" onClick={() => bump(-step)} title="Decrease" disabled={disabled}>
        −
      </button>
      <button type="button" onClick={() => bump(step)} title="Increase" disabled={disabled}>
        +
      </button>
    </div>
  );
}

export function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label?: ReactNode }): JSX.Element {
  return (
    <span className={`toggle ${on ? 'on' : ''}`} onClick={() => onChange(!on)} role="switch" aria-checked={on}>
      <span className="sw" />
      {label}
    </span>
  );
}

/** Item icon on a tile whose frame colour follows the item type. */
export function ItemIcon({ db, itemKey, size = 48, radius = 8, count, equipped }: { db: GameDb; itemKey: string | null | undefined; size?: number; radius?: number; count?: number; equipped?: boolean }): JSX.Element {
  const it = db.item(itemKey);
  const url = db.iconUrl(itemKey);
  return (
    <span
      className={`item-ic ${equipped ? 'equipped' : ''}`}
      style={{ width: size, height: size, borderRadius: radius, '--tier': db.typeColor(it?.t) } as React.CSSProperties}
      title={it ? `${it.n} · ${it.e}` : itemKey ? `Item ${itemKey}` : ''}
    >
      {url ? (
        <img src={url} alt="" style={{ width: size * 0.86, height: size * 0.86 }} draggable={false} loading="lazy" />
      ) : (
        <span className="noicon" style={{ fontSize: size * 0.34 }}>{it ? it.n.slice(0, 2) : '?'}</span>
      )}
      {equipped ? <span className="badge ench">E</span> : null}
      {count !== undefined && count > 1 ? <span className="badge cnt">{fmtCount(count)}</span> : null}
    </span>
  );
}

function fmtCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)}M`;
  if (n >= 10_000) return `${Math.round(n / 1000)}k`;
  return String(n);
}

export function PageHead({ title, sub, subtitle, actions }: { title: string; sub?: string; subtitle?: ReactNode; actions?: ReactNode }): JSX.Element {
  return (
    <div className="page-head">
      <div>
        <h1>
          {title}
          {sub && <small>{sub}</small>}
        </h1>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {actions && <div className="actions">{actions}</div>}
    </div>
  );
}

export function useEscape(onClose: () => void): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
}

export function Field({ label, children, hint }: { label: ReactNode; children: ReactNode; hint?: ReactNode }): JSX.Element {
  return (
    <label className="field">
      <span className="lbl">{label}</span>
      {children}
      {hint && <span className="hint">{hint}</span>}
    </label>
  );
}

export function fmtDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${h}h ${String(m).padStart(2, '0')}m`;
}
