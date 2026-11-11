// 단일 데이터 저장소. 모든 모듈이 같은 상태를 공유해야
// 회고 → 매뉴얼 → 집중 세션 같은 루프가 이어진다.

const KEY = 'human-harness.v1';
const VERSION = 1;

// 각 모듈 = AI 하네스의 한 구성요소
export const MODULES = [
  { id: 'today',  name: '오늘',   layer: '시스템 프롬프트', desc: '하루의 목표와 제약을 먼저 정한다.' },
  { id: 'focus',  name: '집중',   layer: '에이전트 루프',   desc: '계획 → 실행 → 검증 → 다음 단계. 한 번에 한 작업.' },
  { id: 'inbox',  name: '캡처',   layer: '컨텍스트 관리',   desc: '머릿속에 들고 있지 말고 밖에 꺼내 둔다. 정리는 나중에.' },
  { id: 'think',  name: '생각',   layer: '도구',           desc: '맨손으로 생각하지 말고 구조화된 도구를 쓴다.' },
  { id: 'rhythm', name: '리듬',   layer: '리소스 관리',     desc: '에너지, 수면, 습관. 사람은 피로하는 모델이다.' },
  { id: 'manual', name: '매뉴얼', layer: '메모리 (CLAUDE.md)', desc: '경험에서 배운 나만의 규칙. 몸에 익으면 졸업시킨다.' },
  { id: 'review', name: '회고',   layer: '평가 루프',       desc: '측정하고, 하네스 자체를 고친다.' },
];

const emptyDay = () => ({
  intention: '',
  top3: [],
  ifThen: [],
  shutdown: { done: false, win: '', tomorrow: '' },
  sleep: null,
  moved: false,
});

function defaultState() {
  return {
    version: VERSION,
    createdAt: Date.now(),
    settings: {
      modules: Object.fromEntries(MODULES.map((m) => [m.id, true])),
      focusMin: 25,
      onboarded: false,
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

const LIST_KEYS = ['sessions', 'captures', 'rules', 'logs', 'habits', 'thinks', 'reviews'];

// 백업 파일은 손으로 고치거나 오래된 버전일 수 있으므로, 화면이 기대하는 모양으로 하나씩 맞춘다.
const isObj = (v) => v != null && typeof v === 'object' && !Array.isArray(v);
const str = (v) => (typeof v === 'string' ? v : '');
const num = (v, d) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const arr = (v) => (Array.isArray(v) ? v : []);
const idOf = (v) => (typeof v === 'string' && v ? v : uid());

function normDay(d) {
  const e = emptyDay();
  if (!isObj(d)) return e;
  return {
    ...e, ...d,
    intention: str(d.intention),
    top3: arr(d.top3).filter(isObj).map((x) => ({ ...x, id: idOf(x.id), text: str(x.text), done: !!x.done })),
    ifThen: arr(d.ifThen).filter(isObj).map((x) => ({ ...x, id: idOf(x.id), if: str(x.if), then: str(x.then) })),
    shutdown: { ...e.shutdown, ...(isObj(d.shutdown) ? d.shutdown : {}) },
    sleep: num(d.sleep, null),
    moved: !!d.moved,
  };
}

const NORM = {
  sessions: (x) => {
    const startAt = num(x.startAt, Date.now());
    return { ...x, goal: str(x.goal), criteria: str(x.criteria), firstAction: str(x.firstAction), plannedMin: num(x.plannedMin, 25),
      startAt, endAt: num(x.endAt, startAt), status: ['active', 'reviewing', 'done'].includes(x.status) ? x.status : 'done' };
  },
  captures: (x) => ({ ...x, text: str(x.text), at: num(x.at, Date.now()), status: ['inbox', 'later', 'idea', 'done'].includes(x.status) ? x.status : 'inbox' }),
  rules: (x) => ({ ...x, text: str(x.text), trigger: str(x.trigger), status: x.status === 'graduated' ? 'graduated' : 'active', createdAt: num(x.createdAt, Date.now()) }),
  logs: (x) => {
    const at = num(x.at, Date.now());
    return { ...x, at, day: typeof x.day === 'string' ? x.day : dayKey(new Date(at)), hour: num(x.hour, new Date(at).getHours()), energy: num(x.energy, 3) };
  },
  habits: (x) => ({ ...x, anchor: str(x.anchor), tiny: str(x.tiny), status: x.status === 'graduated' ? 'graduated' : 'active', done: isObj(x.done) ? x.done : {} }),
  thinks: (x) => ({ ...x, tool: str(x.tool), data: isObj(x.data) ? x.data : {}, at: num(x.at, Date.now()), updatedAt: num(x.updatedAt, num(x.at, Date.now())) }),
  reviews: (x) => ({ ...x, week: str(x.week), at: num(x.at, Date.now()), wins: str(x.wins), misses: str(x.misses), change: str(x.change) }),
};

function migrate(raw) {
  const d = defaultState();
  if (!isObj(raw)) return d;
  const out = { ...d, ...raw };
  const rs = isObj(raw.settings) ? raw.settings : {};
  out.settings = { ...d.settings, ...rs };
  out.settings.modules = { ...d.settings.modules, ...(isObj(rs.modules) ? rs.modules : {}) };
  out.settings.focusMin = num(out.settings.focusMin, 25);
  if (!MODULES.some((m) => out.settings.modules[m.id])) out.settings.modules.today = true;
  for (const k of LIST_KEYS) out[k] = arr(out[k]).filter(isObj).map((x) => NORM[k]({ ...x, id: idOf(x.id) }));
  out.days = Object.fromEntries(Object.entries(isObj(out.days) ? out.days : {})
    .filter(([k]) => /^\d{4}-\d{2}-\d{2}$/.test(k)).map(([k, v]) => [k, normDay(v)]));
  out.version = VERSION;
  return out;
}

function load() {
  let raw = null;
  try {
    raw = localStorage.getItem(KEY);
    return raw ? migrate(JSON.parse(raw)) : defaultState();
  } catch {
    // 깨진 데이터를 새 기본값으로 덮어쓰기 전에 따로 보관해 둔다.
    try { if (raw) localStorage.setItem(`${KEY}.corrupt-${Date.now()}`, raw); } catch { /* noop */ }
    return defaultState();
  }
}

let state = load();
const subs = new Set();

// 저장은 잠깐 모았다가 한 번에 (타이핑할 때마다 전체를 직렬화하지 않도록)
const SAVE_DELAY = 300;
let saveTimer = null;
let lastWritten = null;
let failing = false;

function writeNow() {
  clearTimeout(saveTimer);
  saveTimer = null;
  try {
    const json = JSON.stringify(state);
    localStorage.setItem(KEY, json);
    lastWritten = json;
    if (failing) {
      failing = false;
      window.dispatchEvent(new CustomEvent('harness:persist', { detail: { ok: true } }));
    }
  } catch (e) {
    console.warn('저장 실패', e);
    if (!failing) {
      failing = true;
      window.dispatchEvent(new CustomEvent('harness:persist', { detail: { ok: false, error: e } }));
    }
  }
}
function persist() {
  if (!saveTimer) saveTimer = setTimeout(writeNow, SAVE_DELAY);
}
function emit() {
  subs.forEach((f) => f(state));
}

// 탭이 닫히거나 가려지기 전에 남은 저장을 마친다.
window.addEventListener('pagehide', () => { if (saveTimer) writeNow(); });
document.addEventListener('visibilitychange', () => { if (document.hidden && saveTimer) writeNow(); });

// 다른 탭(또는 설치한 앱 창)에서 바꾼 내용을 받아 온다. 받지 않으면 서로의 기록을 덮어쓴다.
window.addEventListener('storage', (e) => {
  if (e.key !== KEY || e.storageArea !== localStorage) return;
  if (e.newValue == null) {
    state = defaultState();
  } else {
    if (e.newValue === lastWritten) return;
    try { state = migrate(JSON.parse(e.newValue)); } catch { return; }
  }
  lastWritten = e.newValue;
  clearTimeout(saveTimer);
  saveTimer = null;
  emit();
});

export const store = {
  get: () => state,
  // silent: 입력 중인 텍스트처럼 화면을 다시 그리면 안 되는 변경
  update(fn, { silent = false } = {}) {
    fn(state);
    persist();
    if (!silent) emit();
  },
  subscribe(f) {
    subs.add(f);
    return () => subs.delete(f);
  },
  exportJSON: () => JSON.stringify(state, null, 2),
  importJSON(text) {
    const parsed = JSON.parse(text);
    if (!parsed || typeof parsed !== 'object' || !('settings' in parsed)) {
      throw new Error('휴먼 하네스 백업 파일이 아닙니다.');
    }
    state = migrate(parsed);
    writeNow();
    emit();
  },
  reset() {
    state = defaultState();
    writeNow();
    emit();
  },
  flush: () => { if (saveTimer) writeNow(); },
};

export function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

export function dayKey(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}
export function keyToDate(k) {
  const [y, m, d] = k.split('-').map(Number);
  return new Date(y, m - 1, d);
}
// 읽기 전용 (저장소에 빈 날을 만들지 않음)
export const peekDay = (s, key = dayKey()) => s.days[key] || emptyDay();
// 쓰기용 (update 안에서만 호출)
export function getDay(s, key = dayKey()) {
  if (!s.days[key]) s.days[key] = emptyDay();
  return s.days[key];
}

export function lastDayKeys(n, end = new Date()) {
  const out = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(end);
    d.setDate(d.getDate() - i);
    out.push(dayKey(d));
  }
  return out;
}
export function weekStart(d = new Date()) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); // 월요일 시작
  return x;
}

export const openSession = (s) => s.sessions.find((x) => x.status === 'active' || x.status === 'reviewing') || null;
export const runningSession = (s) => s.sessions.find((x) => x.status === 'active') || null;
export const activeRules = (s) => s.rules.filter((r) => r.status === 'active');

export function addCapture(s, text, sessionId = null) {
  s.captures.unshift({ id: uid(), text: text.trim(), at: Date.now(), status: 'inbox', sessionId });
}
export function addRule(s, text, trigger = '', source = 'manual') {
  s.rules.unshift({ id: uid(), text: text.trim(), trigger: trigger.trim(), status: 'active', source, createdAt: Date.now() });
}
