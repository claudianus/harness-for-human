// v3 데이터 모양과 순수 함수. 브라우저 API를 쓰지 않으므로 그대로 테스트할 수 있다.
// 앱이 계획하고, 사람은 지금 할 것 하나만 한다 (docs/REDESIGN.md).

export const STORAGE_KEY = 'human-harness.v3';
export const LEGACY_KEY = 'human-harness.v1';
export const VERSION = 3;

export type Struggle = 'wake' | 'wash' | 'meal' | 'outside' | 'chores' | 'start' | 'promise' | 'sleep';
export type Condition = 0 | 1 | 2 | 3;

export interface Profile {
  setupAt: number | null; // null이면 첫 설정 전
  wake: string; // 'HH:MM'
  wakeIrregular: boolean;
  sleep: string; // 'HH:MM'
  condition: Condition;
  struggles: Struggle[];
}

export interface Anchor {
  id: string;
  tpl: string; // 템플릿 id ('custom' 또는 'legacy' 포함)
  title: string;
  minimum: string; // 2분이면 되는 최소 버전
  time: string; // 'HH:MM'
  target: 'full' | 'min'; // 'min'이면 최소 버전이 목표
  status: 'active' | 'paused' | 'graduated';
  createdAt: number;
}

export type OutcomeStatus = 'done' | 'min' | 'skip' | 'missed';
export type Reason = 'time' | 'big' | 'forgot' | 'unwilling' | 'none';
export interface Outcome { status: OutcomeStatus; at: number; reason?: Reason; late?: boolean }

export interface Day {
  outcomes: Record<string, Outcome>;
  snoozes: Record<string, number>; // 이 시각이 지나면 다시 보여 준다
  snoozeCount: Record<string, number>;
  wrapRequested: boolean; // 마감 시각 전에 직접 마감을 열었다
  closed: boolean;
  closedAt?: number;
}

export interface Item { id: string; text: string; at: number; status: 'inbox' | 'done' }

export interface State {
  version: number;
  createdAt: number;
  profile: Profile;
  settings: { notify: boolean };
  anchors: Anchor[];
  days: Record<string, Day>;
  items: Item[];
}

export const emptyDay = (): Day => ({ outcomes: {}, snoozes: {}, snoozeCount: {}, wrapRequested: false, closed: false });

export function defaultState(): State {
  return {
    version: VERSION,
    createdAt: Date.now(),
    profile: { setupAt: null, wake: '09:00', wakeIrregular: false, sleep: '00:00', condition: 1, struggles: [] },
    settings: { notify: true },
    anchors: [],
    days: {},
    items: [],
  };
}

export function uid(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

export function dayKey(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}
export function keyToDate(k: string): Date {
  const [y, m, d] = k.split('-').map(Number);
  return new Date(y, m - 1, d);
}

// 쓰기용 (update 안에서만)
export function getDay(s: State, key: string): Day {
  if (!s.days[key]) s.days[key] = emptyDay();
  return s.days[key];
}
export const peekDay = (s: State, key: string): Day => s.days[key] || emptyDay();

// ---- 가져온 데이터 정규화 ----
type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => v != null && typeof v === 'object' && !Array.isArray(v);
const str = (v: unknown, d = '') => (typeof v === 'string' ? v : d);
const num = <D,>(v: unknown, d: D): number | D => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const idOf = (v: unknown) => (typeof v === 'string' && v ? v : uid());
const oneOf = <T extends string>(v: unknown, opts: readonly T[], d: T): T => (opts.includes(v as T) ? (v as T) : d);
const hhmm = (v: unknown, d: string) => (typeof v === 'string' && /^\d{2}:\d{2}$/.test(v) ? v : d);
const numMap = (v: unknown): Record<string, number> =>
  isObj(v) ? Object.fromEntries(Object.entries(v).filter(([, x]) => typeof x === 'number' && Number.isFinite(x))) as Record<string, number> : {};

const STRUGGLES = ['wake', 'wash', 'meal', 'outside', 'chores', 'start', 'promise', 'sleep'] as const;
const REASONS = ['time', 'big', 'forgot', 'unwilling', 'none'] as const;

function normOutcome(v: unknown): Outcome | null {
  if (!isObj(v)) return null;
  const o: Outcome = { status: oneOf(v.status, ['done', 'min', 'skip', 'missed'] as const, 'missed'), at: num(v.at, 0) };
  if (v.reason != null) o.reason = oneOf(v.reason, REASONS, 'none');
  if (v.late === true) o.late = true;
  return o;
}

function normDay(v: unknown): Day {
  const d = emptyDay();
  if (!isObj(v)) return d;
  const outcomes: Record<string, Outcome> = {};
  if (isObj(v.outcomes)) for (const [k, x] of Object.entries(v.outcomes)) { const o = normOutcome(x); if (o) outcomes[k] = o; }
  return {
    outcomes,
    snoozes: numMap(v.snoozes),
    snoozeCount: numMap(v.snoozeCount),
    wrapRequested: v.wrapRequested === true,
    closed: v.closed === true,
    ...(typeof v.closedAt === 'number' ? { closedAt: v.closedAt } : {}),
  };
}

function normAnchor(x: Obj): Anchor {
  return {
    id: idOf(x.id), tpl: str(x.tpl, 'custom'), title: str(x.title), minimum: str(x.minimum),
    time: hhmm(x.time, '12:00'), target: x.target === 'min' ? 'min' : 'full',
    status: oneOf(x.status, ['active', 'paused', 'graduated'] as const, 'active'),
    createdAt: num(x.createdAt, Date.now()),
  };
}

export function migrate(raw: unknown): State {
  const d = defaultState();
  if (!isObj(raw)) return d;
  const p = isObj(raw.profile) ? raw.profile : {};
  const days: Record<string, Day> = {};
  if (isObj(raw.days)) for (const [k, v] of Object.entries(raw.days)) if (/^\d{4}-\d{2}-\d{2}$/.test(k)) days[k] = normDay(v);
  return {
    version: VERSION,
    createdAt: num(raw.createdAt, d.createdAt),
    profile: {
      setupAt: num(p.setupAt, null),
      wake: hhmm(p.wake, d.profile.wake),
      wakeIrregular: p.wakeIrregular === true,
      sleep: hhmm(p.sleep, d.profile.sleep),
      condition: ([0, 1, 2, 3].includes(p.condition as number) ? p.condition : 1) as Condition,
      struggles: arr(p.struggles).filter((x): x is Struggle => STRUGGLES.includes(x as Struggle)),
    },
    settings: { notify: isObj(raw.settings) && typeof raw.settings.notify === 'boolean' ? raw.settings.notify : true },
    anchors: arr(raw.anchors).filter(isObj).map(normAnchor),
    days,
    items: arr(raw.items).filter(isObj).map((x) => ({ id: idOf(x.id), text: str(x.text), at: num(x.at, Date.now()), status: x.status === 'done' ? 'done' as const : 'inbox' as const })),
  };
}

// v1/v2 데이터에서 v3로: 미처리 캡처 → 할 일 상자, 활성 습관 → 꺼 둔 루틴. 나머지는 버린다.
export function fromLegacy(raw: unknown): State {
  const s = defaultState();
  if (!isObj(raw)) return s;
  s.items = arr(raw.captures).filter(isObj)
    .filter((c) => c.status === 'inbox' && typeof c.text === 'string' && c.text.trim())
    .map((c) => ({ id: idOf(c.id), text: c.text as string, at: num(c.at, Date.now()), status: 'inbox' }));
  s.anchors = arr(raw.habits).filter(isObj)
    .filter((h) => h.status !== 'graduated' && typeof h.tiny === 'string' && h.tiny.trim())
    .map((h) => ({
      id: idOf(h.id), tpl: 'legacy',
      title: typeof h.anchor === 'string' && h.anchor.trim() ? `${h.anchor} 후 ${h.tiny}` : (h.tiny as string),
      minimum: h.tiny as string, time: '12:00', target: 'full', status: 'paused', createdAt: num(h.createdAt, Date.now()),
    }));
  return s;
}

export function isBackup(v: unknown): boolean {
  return isObj(v) && ('profile' in v || 'settings' in v);
}
export const isLegacy = (v: unknown) => isObj(v) && !('profile' in v) && 'settings' in v;
