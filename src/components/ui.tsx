import { useLayoutEffect, useRef, type KeyboardEvent, type ReactNode } from 'react';

const ICONS: Record<string, string> = {
  today: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  focus: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
  inbox: '<path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/>',
  think: '<path d="M9 18h6M10 22h4"/><path d="M12 2a7 7 0 0 0-4 12.7c.6.5 1 1.3 1 2.1V17h6v-.2c0-.8.4-1.6 1-2.1A7 7 0 0 0 12 2z"/>',
  rhythm: '<path d="M22 12h-4l-3 9L9 3l-3 9H2"/>',
  manual: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>',
  review: '<path d="M21 12a9 9 0 1 1-3-6.7L21 8"/><path d="M21 3v5h-5"/>',
  settings: '<path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6"/>',
  now: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="3.5" fill="currentColor"/>',
  day: '<path d="M8 6h13M8 12h13M8 18h13"/><circle cx="3.5" cy="6" r="1"/><circle cx="3.5" cy="12" r="1"/><circle cx="3.5" cy="18" r="1"/>',
  me: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  bell: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>',
};

export function Icon({ name, size = 22 }: { name: string; size?: number }) {
  return (
    <span className="ico">
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
        strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" dangerouslySetInnerHTML={{ __html: ICONS[name] || '' }} />
    </span>
  );
}

export function Card({ title, sub, tag, cls = '', children }: { title?: ReactNode; sub?: ReactNode; tag?: ReactNode; cls?: string; children?: ReactNode }) {
  return (
    <section className={`card ${cls}`}>
      {(title || tag) && (
        <div className="card-head">
          {title && <h2>{title}</h2>}
          {tag != null && tag !== false && <span className="tag">{tag}</span>}
        </div>
      )}
      {sub && <p className="sub">{sub}</p>}
      {children}
    </section>
  );
}

// 한글 입력 중(조합 중) Enter는 글자 확정용이므로 무시한다.
const isEnter = (e: KeyboardEvent) => e.key === 'Enter' && !e.nativeEvent.isComposing && e.keyCode !== 229;

interface TextProps {
  value: string;
  onChange?: (v: string) => void;
  onEnter?: (v: string) => void;
  placeholder?: string;
  cls?: string;
  label?: string;
  autoFocus?: boolean;
}

export function TextArea({ value, onChange, onEnter, placeholder = '', cls = '', label, rows = 1, autoFocus }: TextProps & { rows?: number }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  // 내용에 맞춰 높이를 늘린다
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight + 2}px`;
  }, [value]);
  return (
    <textarea
      ref={ref}
      className={`field ${cls}`}
      rows={rows}
      placeholder={placeholder}
      aria-label={label || placeholder}
      value={value ?? ''}
      autoFocus={autoFocus}
      onChange={(e) => onChange?.(e.target.value)}
      onKeyDown={onEnter && ((e) => {
        if (isEnter(e) && !e.shiftKey) {
          e.preventDefault();
          onEnter(e.currentTarget.value);
        }
      })}
    />
  );
}

export function TextInput({ value, onChange, onEnter, placeholder = '', cls = '', label, autoFocus, type = 'text' }: TextProps & { type?: string }) {
  return (
    <input
      type={type}
      className={`field ${cls}`}
      placeholder={placeholder}
      aria-label={label || placeholder}
      value={value ?? ''}
      autoFocus={autoFocus}
      onChange={(e) => onChange?.(e.target.value)}
      onKeyDown={onEnter && ((e) => {
        if (isEnter(e)) {
          e.preventDefault();
          onEnter(e.currentTarget.value);
        }
      })}
    />
  );
}

export function Field({ label, hint, children }: { label: ReactNode; hint?: ReactNode; children: ReactNode }) {
  return (
    <label className="fieldset">
      <span className="label">{label}</span>
      {children}
      {hint && <span className="hint">{hint}</span>}
    </label>
  );
}

export function Btn({ children, onClick, cls = '', title }: { children: ReactNode; onClick?: () => void; cls?: string; title?: string }) {
  return <button type="button" className={`btn ${cls}`} onClick={onClick} title={title}>{children}</button>;
}

export function IconBtn({ name, label, onClick, cls = '' }: { name: string; label: string; onClick: () => void; cls?: string }) {
  return (
    <button type="button" className={`icon-btn ${cls}`} aria-label={label} title={label} onClick={onClick}>
      <Icon name={name} size={18} />
    </button>
  );
}

export interface ChipOption<T> { value: T; label: ReactNode; cls?: string }

export function Chips<T>({ options, value, onPick, cls = '' }: { options: ChipOption<T>[]; value: T | null | undefined; onPick: (v: T) => void; cls?: string }) {
  return (
    <div className={`chips ${cls}`} role="group">
      {options.map((o) => (
        <button key={String(o.value)} type="button" className={`chip ${o.value === value ? 'on' : ''} ${o.cls || ''}`}
          aria-pressed={o.value === value} onClick={() => onPick(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export const Empty = ({ children }: { children: ReactNode }) => <p className="empty">{children}</p>;
