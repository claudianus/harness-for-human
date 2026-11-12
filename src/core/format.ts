// 화면 문구용 시각 표시
const WEEK = ['일', '월', '화', '수', '목', '금', '토'];

export const hm = (ts: number) => {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

// '14:00' → '오후 2시', '09:30' → '오전 9시 30분'
export function spoken(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number);
  const part = h === 0 ? '밤' : h < 6 ? '새벽' : h < 12 ? '오전' : h === 12 ? '낮' : h < 18 ? '오후' : h < 21 ? '저녁' : '밤';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  const label = `${part} ${h12}시`;
  return m ? `${label} ${m}분` : label;
}
export const spokenTs = (ts: number) => spoken(hm(ts));

export function until(ms: number): string {
  const m = Math.max(1, Math.round(ms / 60000));
  if (m < 60) return `${m}분 뒤`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r ? `${h}시간 ${r}분 뒤` : `${h}시간 뒤`;
}

export function dateLabel(key: string): string {
  const [y, mo, d] = key.split('-').map(Number);
  const w = WEEK[new Date(y, mo - 1, d).getDay()];
  return `${mo}월 ${d}일 ${w}요일`;
}

// 받침에 맞는 조사: 은/는, 을/를, 이/가
export function josa(word: string, pair: '은는' | '을를' | '이가'): string {
  const c = word.trim().charCodeAt(word.trim().length - 1);
  const has = c >= 0xac00 && c <= 0xd7a3 ? (c - 0xac00) % 28 !== 0 : false;
  return word + (has ? pair[0] : pair[1]);
}

export const STATE_LABEL: Record<string, string> = {
  done: '했어요', min: '최소만 했어요', skip: '안 하기로 함', missed: '못 했어요',
  due: '지금 할 차례', snoozed: '미뤄 둠', upcoming: '예정', passed: '지나감', na: '시작 전',
};

export const REASONS: { v: 'time' | 'big' | 'forgot' | 'unwilling' | 'none'; label: string }[] = [
  { v: 'time', label: '시간이 안 맞았어요' }, { v: 'big', label: '너무 컸어요' }, { v: 'forgot', label: '잊어버렸어요' },
  { v: 'unwilling', label: '하기 싫었어요' }, { v: 'none', label: '그냥요' },
];

// '오늘 오후 3시', '내일 오전 9시', '11월 14일 오후 3시'
// ds: 하루가 바뀌는 시각(분). 새벽 0시 반에 말하는 "내일 아침"은 자고 일어난 아침이다.
export function whenLabel(ts: number, now: number, ds = 0): string {
  const d = new Date(ts - ds * 60000);
  const n = new Date(now - ds * 60000);
  const days = Math.round((new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() - new Date(n.getFullYear(), n.getMonth(), n.getDate()).getTime()) / 86_400_000);
  const day = days === 0 ? '오늘' : days === 1 ? '내일' : days === -1 ? '어제' : days === 2 ? '모레' : `${d.getMonth() + 1}월 ${d.getDate()}일`;
  const real = new Date(ts);
  return `${days > 2 || days < -1 ? `${real.getMonth() + 1}월 ${real.getDate()}일` : day} ${spokenTs(ts)}`;
}
export const clipLength = (ms: number) => {
  const t = Math.max(1, Math.round(ms / 1000));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
};
export const MOODS: { v: 1 | 2 | 3 | 4 | 5; icon: string; label: string }[] = [
  { v: 1, icon: '😣', label: '힘들었어요' }, { v: 2, icon: '😕', label: '별로였어요' }, { v: 3, icon: '😐', label: '그냥 그랬어요' },
  { v: 4, icon: '🙂', label: '괜찮았어요' }, { v: 5, icon: '😄', label: '좋았어요' },
];
