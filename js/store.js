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

function migrate(raw) {
  const d = defaultState();
  if (!raw || typeof raw !== 'object') return d;
  const out = { ...d, ...raw };
  out.settings = { ...d.settings, ...(raw.settings || {}) };
  out.settings.modules = { ...d.settings.modules, ...((raw.settings || {}).modules || {}) };
  for (const k of LIST_KEYS) if (!Array.isArray(out[k])) out[k] = [];
  if (!out.days || typeof out.days !== 'object') out.days = {};
  out.version = VERSION;
  return out;
}

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? migrate(JSON.parse(raw)) : defaultState();
  } catch {
    return defaultState();
  }
}

let state = load();
const subs = new Set();

function persist() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch (e) {
    console.warn('저장 실패', e);
  }
}
function emit() {
  subs.forEach((f) => f(state));
}

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
    persist();
    emit();
  },
  reset() {
    state = defaultState();
    persist();
    emit();
  },
};

export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

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
