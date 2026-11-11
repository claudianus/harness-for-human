// 데이터 모양과 순수 함수. 브라우저 API를 쓰지 않으므로 그대로 테스트할 수 있다.
// 저장 키와 JSON 모양은 바닐라 버전(v1)과 같다. 기존 기록과 백업 파일이 그대로 열린다.

export const STORAGE_KEY = 'human-harness.v1';
export const VERSION = 1;

export type ModuleId = 'today' | 'focus' | 'inbox' | 'think' | 'rhythm' | 'manual' | 'review';

// 각 모듈 = AI 하네스의 한 구성요소
export const MODULES: { id: ModuleId; name: string; layer: string; desc: string }[] = [
  { id: 'today', name: '오늘', layer: '시스템 프롬프트', desc: '하루의 목표와 제약을 먼저 정한다.' },
  { id: 'focus', name: '집중', layer: '에이전트 루프', desc: '계획 → 실행 → 검증 → 다음 단계. 한 번에 한 작업.' },
  { id: 'inbox', name: '캡처', layer: '컨텍스트 관리', desc: '머릿속에 들고 있지 말고 밖에 꺼내 둔다. 정리는 나중에.' },
  { id: 'think', name: '생각', layer: '도구', desc: '맨손으로 생각하지 말고 구조화된 도구를 쓴다.' },
  { id: 'rhythm', name: '리듬', layer: '리소스 관리', desc: '에너지, 수면, 습관. 사람은 피로하는 모델이다.' },
  { id: 'manual', name: '매뉴얼', layer: '메모리 (CLAUDE.md)', desc: '경험에서 배운 나만의 규칙. 몸에 익으면 졸업시킨다.' },
  { id: 'review', name: '회고', layer: '평가 루프', desc: '측정하고, 하네스 자체를 고친다.' },
];

export interface TopItem { id: string; text: string; done: boolean }
export interface IfThen { id: string; if: string; then: string }
export interface Day {
  intention: string;
  top3: TopItem[];
  ifThen: IfThen[];
  shutdown: { done: boolean; win: string; tomorrow: string };
  sleep: number | null;
  moved: boolean;
}
export type Verdict = 'met' | 'partial' | 'missed';
export interface Session {
  id: string;
  goal: string;
  criteria: string;
  firstAction: string;
  plannedMin: number;
  startAt: number;
  endAt: number;
  status: 'active' | 'reviewing' | 'done';
  verdict?: Verdict;
  reflection?: string;
  nextStep?: string;
}
export type CaptureStatus = 'inbox' | 'later' | 'idea' | 'done';
export interface Capture { id: string; text: string; at: number; status: CaptureStatus; sessionId: string | null }
export interface Rule {
  id: string;
  text: string;
  trigger: string;
  status: 'active' | 'graduated';
  source: string;
  createdAt: number;
  graduatedAt?: number;
}
export interface EnergyLog { id: string; at: number; day: string; hour: number; energy: number }
export interface Habit {
  id: string;
  anchor: string;
  tiny: string;
  status: 'active' | 'graduated';
  done: Record<string, boolean>;
  createdAt?: number;
}
export interface Think {
  id: string;
  tool: string;
  // 도구마다 칸이 다르다. 편집기에서 도구 정의에 맞춰 채운다.
  data: Record<string, unknown>;
  at: number;
  updatedAt: number;
}
export interface Review {
  id: string;
  week: string;
  at: number;
  wins: string;
  misses: string;
  change: string;
  stats?: Record<string, unknown>;
}
export interface NotifySettings {
  timer: boolean;
  morning: string; // 'HH:MM' 또는 '' (끔)
  evening: string;
}
export interface Settings {
  modules: Record<ModuleId, boolean>;
  focusMin: number;
  onboarded: boolean;
  notify: NotifySettings;
}
export interface State {
  version: number;
  createdAt: number;
  settings: Settings;
  days: Record<string, Day>;
  sessions: Session[];
  captures: Capture[];
  rules: Rule[];
  logs: EnergyLog[];
  habits: Habit[];
  thinks: Think[];
  reviews: Review[];
}

export const emptyDay = (): Day => ({
  intention: '',
  top3: [],
  ifThen: [],
  shutdown: { done: false, win: '', tomorrow: '' },
  sleep: null,
  moved: false,
});

export function defaultState(): State {
  return {
    version: VERSION,
    createdAt: Date.now(),
    settings: {
      modules: Object.fromEntries(MODULES.map((m) => [m.id, true])) as Record<ModuleId, boolean>,
      focusMin: 25,
      onboarded: false,
      notify: { timer: true, morning: '', evening: '' },
    },
    days: {},
    sessions: [],
    captures: [],
    rules: [],
    logs: [],
    habits: [],
    thinks: [],
    reviews: [],
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
export function lastDayKeys(n: number, end: Date = new Date()): string[] {
  const out: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(end);
    d.setDate(d.getDate() - i);
    out.push(dayKey(d));
  }
  return out;
}
export function weekStart(d: Date = new Date()): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); // 월요일 시작
  return x;
}

// 읽기 전용 (빈 날을 만들지 않음)
export const peekDay = (s: State, key = dayKey()): Day => s.days[key] || emptyDay();
// 쓰기용 (update 안에서만)
export function getDay(s: State, key = dayKey()): Day {
  if (!s.days[key]) s.days[key] = emptyDay();
  return s.days[key];
}

export const openSession = (s: State) => s.sessions.find((x) => x.status === 'active' || x.status === 'reviewing') || null;
export const runningSession = (s: State) => s.sessions.find((x) => x.status === 'active') || null;
export const activeRules = (s: State) => s.rules.filter((r) => r.status === 'active');

export function addCapture(s: State, text: string, sessionId: string | null = null) {
  s.captures.unshift({ id: uid(), text: text.trim(), at: Date.now(), status: 'inbox', sessionId });
}
export function addRule(s: State, text: string, trigger = '', source = 'manual') {
  s.rules.unshift({ id: uid(), text: text.trim(), trigger: trigger.trim(), status: 'active', source, createdAt: Date.now() });
}

// ---- 가져온 데이터 정규화 ----
// 백업 파일은 손으로 고치거나 오래된 버전일 수 있다. 화면이 기대하는 모양으로 하나씩 맞춘다.

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => v != null && typeof v === 'object' && !Array.isArray(v);
const str = (v: unknown) => (typeof v === 'string' ? v : '');
const num = <D,>(v: unknown, d: D): number | D => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const idOf = (v: unknown) => (typeof v === 'string' && v ? v : uid());
const objs = (v: unknown): (Obj & { id: string })[] => arr(v).filter(isObj).map((x) => ({ ...x, id: idOf(x.id) }));
const oneOf = <T extends string>(v: unknown, opts: readonly T[], d: T): T => (opts.includes(v as T) ? (v as T) : d);
const timeStr = (v: unknown) => (typeof v === 'string' && /^\d{2}:\d{2}$/.test(v) ? v : '');

function normDay(d: unknown): Day {
  const e = emptyDay();
  if (!isObj(d)) return e;
  const sd = isObj(d.shutdown) ? d.shutdown : {};
  return {
    ...(d as object),
    intention: str(d.intention),
    top3: objs(d.top3).map((x) => ({ ...x, text: str(x.text), done: !!x.done })),
    ifThen: objs(d.ifThen).map((x) => ({ ...x, if: str(x.if), then: str(x.then) })),
    shutdown: { ...sd, done: !!sd.done, win: str(sd.win), tomorrow: str(sd.tomorrow) },
    sleep: num(d.sleep, null),
    moved: !!d.moved,
  };
}

const NORM = {
  sessions: (x: Obj): Session => {
    const startAt = num(x.startAt, Date.now());
    return {
      ...x, id: x.id as string,
      goal: str(x.goal), criteria: str(x.criteria), firstAction: str(x.firstAction),
      plannedMin: num(x.plannedMin, 25), startAt, endAt: num(x.endAt, startAt),
      status: oneOf(x.status, ['active', 'reviewing', 'done'] as const, 'done'),
      verdict: x.verdict == null ? undefined : oneOf(x.verdict, ['met', 'partial', 'missed'] as const, 'partial'),
      reflection: str(x.reflection), nextStep: str(x.nextStep),
    };
  },
  captures: (x: Obj): Capture => ({
    ...x, id: x.id as string, text: str(x.text), at: num(x.at, Date.now()),
    status: oneOf(x.status, ['inbox', 'later', 'idea', 'done'] as const, 'inbox'),
    sessionId: typeof x.sessionId === 'string' ? x.sessionId : null,
  }),
  rules: (x: Obj): Rule => ({
    ...x, id: x.id as string, text: str(x.text), trigger: str(x.trigger), source: str(x.source) || 'manual',
    status: x.status === 'graduated' ? 'graduated' : 'active', createdAt: num(x.createdAt, Date.now()),
  }),
  logs: (x: Obj): EnergyLog => {
    const at = num(x.at, Date.now());
    return {
      ...x, id: x.id as string, at,
      day: typeof x.day === 'string' ? x.day : dayKey(new Date(at)),
      hour: num(x.hour, new Date(at).getHours()), energy: num(x.energy, 3),
    };
  },
  habits: (x: Obj): Habit => ({
    ...x, id: x.id as string, anchor: str(x.anchor), tiny: str(x.tiny),
    status: x.status === 'graduated' ? 'graduated' : 'active',
    done: isObj(x.done) ? (x.done as Record<string, boolean>) : {},
  }),
  thinks: (x: Obj): Think => ({
    ...x, id: x.id as string, tool: str(x.tool), data: isObj(x.data) ? x.data : {},
    at: num(x.at, Date.now()), updatedAt: num(x.updatedAt, num(x.at, Date.now())),
  }),
  reviews: (x: Obj): Review => ({
    ...x, id: x.id as string, week: str(x.week), at: num(x.at, Date.now()),
    wins: str(x.wins), misses: str(x.misses), change: str(x.change),
  }),
};

export function migrate(raw: unknown): State {
  const d = defaultState();
  if (!isObj(raw)) return d;
  const rs = isObj(raw.settings) ? raw.settings : {};
  const rn = isObj(rs.notify) ? rs.notify : {};
  const modules = { ...d.settings.modules };
  if (isObj(rs.modules)) for (const m of MODULES) if (typeof rs.modules[m.id] === 'boolean') modules[m.id] = rs.modules[m.id] as boolean;
  if (!MODULES.some((m) => modules[m.id])) modules.today = true;

  const days: Record<string, Day> = {};
  if (isObj(raw.days)) for (const [k, v] of Object.entries(raw.days)) if (/^\d{4}-\d{2}-\d{2}$/.test(k)) days[k] = normDay(v);

  return {
    ...(raw as object),
    version: VERSION,
    createdAt: num(raw.createdAt, d.createdAt),
    settings: {
      ...rs,
      modules,
      focusMin: num(rs.focusMin, 25),
      onboarded: !!rs.onboarded,
      notify: { timer: typeof rn.timer === 'boolean' ? rn.timer : true, morning: timeStr(rn.morning), evening: timeStr(rn.evening) },
    },
    days,
    sessions: objs(raw.sessions).map(NORM.sessions),
    captures: objs(raw.captures).map(NORM.captures),
    rules: objs(raw.rules).map(NORM.rules),
    logs: objs(raw.logs).map(NORM.logs),
    habits: objs(raw.habits).map(NORM.habits),
    thinks: objs(raw.thinks).map(NORM.thinks),
    reviews: objs(raw.reviews).map(NORM.reviews),
  };
}

export function isBackup(v: unknown): boolean {
  return isObj(v) && 'settings' in v;
}
