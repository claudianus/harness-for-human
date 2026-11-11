// 루틴 템플릿과 시작 루틴 처방표.
// 첫 설정 답변으로 "닻" 3개를 처방한다. 사용자가 고르는 게 아니라 앱이 정한다.
import { uid, type Anchor, type Condition, type Struggle } from '../store/model';

export interface Template {
  id: string;
  title: string;
  minimum: string;
  icon: string;
  // 시각 정하기: 기상/취침 기준 + 분
  at: { from: 'wake' | 'sleep'; min: number };
}

export const TEMPLATES: Record<string, Template> = {
  wake_water: { id: 'wake_water', title: '일어나서 물 한 컵 마시기', minimum: '침대에서 일어나 앉기', icon: '☀️', at: { from: 'wake', min: 0 } },
  wash: { id: 'wash', title: '씻기', minimum: '세수만 하기', icon: '🚿', at: { from: 'wake', min: 30 } },
  start: { id: 'start', title: '미뤄 둔 일 하나 5분만 하기', minimum: '그 일에 필요한 걸 꺼내 두기', icon: '✏️', at: { from: 'wake', min: 120 } },
  meal: { id: 'meal', title: '뭐든 챙겨 먹기', minimum: '바나나나 빵 하나 먹기', icon: '🍚', at: { from: 'wake', min: 240 } },
  outside: { id: 'outside', title: '밖에 나가서 10분 걷기', minimum: '현관문 열고 1분 서 있기', icon: '🚶', at: { from: 'wake', min: 360 } },
  chores: { id: 'chores', title: '눈에 보이는 쓰레기 3개 버리기', minimum: '쓰레기 1개 버리기', icon: '🧺', at: { from: 'sleep', min: -180 } },
  promise: { id: 'promise', title: '내일 일정과 약속 확인하기', minimum: '달력 앱 한 번 열어 보기', icon: '📅', at: { from: 'sleep', min: -120 } },
  sleep_wind: { id: 'sleep_wind', title: '폰 내려놓고 눕기', minimum: '불 끄기', icon: '🌙', at: { from: 'sleep', min: 0 } },
};

// 고민 → 세 번째 닻. 일어나기·잠들기는 기본 닻이 이미 맡는다.
const STRUGGLE_TPL: Partial<Record<Struggle, string>> = {
  meal: 'meal', wash: 'wash', outside: 'outside', start: 'start', chores: 'chores', promise: 'promise',
};

export const toMin = (t: string) => {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
};
export const fromMin = (m: number) => {
  const x = ((Math.round(m) % 1440) + 1440) % 1440;
  return `${String(Math.floor(x / 60)).padStart(2, '0')}:${String(x % 60).padStart(2, '0')}`;
};

export function timeFor(t: Template, wake: string, sleep: string): string {
  const base = toMin(t.at.from === 'wake' ? wake : sleep);
  const m = base + t.at.min;
  return fromMin(Math.round(m / 15) * 15); // 15분 단위로
}

export interface SetupAnswers {
  wake: string;
  wakeIrregular: boolean;
  sleep: string;
  condition: Condition;
  struggles: Struggle[];
}

// 처방: 기상 닻 + (고민에 맞춘 닻 하나) + 취침 닻.
// 고민이 일어나기·잠들기뿐이거나 없으면 끼니를 넣는다 (끼니가 무너지면 나머지도 무너진다).
// 생활이 "아무것도 안 됨"이면 처음 2주는 최소 버전이 목표다.
export function pickThird(struggles: Struggle[]): string {
  for (const s of struggles) if (STRUGGLE_TPL[s]) return STRUGGLE_TPL[s]!;
  return 'meal';
}

export function prescribe(a: SetupAnswers, now = Date.now()): Anchor[] {
  const ids = ['wake_water', pickThird(a.struggles), 'sleep_wind'];
  const target = a.condition === 3 ? 'min' : 'full';
  return ids.map((id) => {
    const t = TEMPLATES[id];
    return { id: uid(), tpl: id, title: t.title, minimum: t.minimum, time: timeFor(t, a.wake, a.sleep), target, status: 'active', createdAt: now };
  });
}

export const iconOf = (a: Pick<Anchor, 'tpl'>) => TEMPLATES[a.tpl]?.icon ?? '•';
