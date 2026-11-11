// 하루 엔진: "지금 무엇을 보여 줄지"를 정한다. 순수 함수, 현재 시각은 항상 인자로 받는다.
//
// 하루의 경계: 취침과 기상의 한가운데. (01:00에 자고 09:00에 깨면 05:00에 하루가 바뀐다)
// 그래서 새벽 1시의 "눕기"는 전날 하루에 속한다.
import { dayKey, emptyDay, keyToDate, type Anchor, type Day, type Profile, type State } from '../store/model';
import { toMin } from './templates';

const DAY = 1440;
export const WRAP_LEAD = 90; // 취침 90분 전부터 하루 마감
export const LAST_WINDOW = 180; // 한 닻은 길어야 3시간 동안 "지금 할 것"

export function dayStartMin(p: Profile): number {
  if (!p.setupAt) return 4 * 60;
  const s = toMin(p.sleep);
  const gap = (toMin(p.wake) - s + DAY) % DAY; // 잠든 시간
  return (s + Math.floor(gap / 2)) % DAY;
}

const clockMin = (d: Date) => d.getHours() * 60 + d.getMinutes();

export function logicalKey(now: number, ds: number): string {
  return dayKey(new Date(now - ds * 60000));
}
export function prevKey(key: string): string {
  const d = keyToDate(key);
  d.setDate(d.getDate() - 1);
  return dayKey(d);
}
export function dayStartTs(key: string, ds: number): number {
  return keyToDate(key).getTime() + ds * 60000;
}
export const offsetOf = (hhmm: string, ds: number) => (toMin(hhmm) - ds + DAY) % DAY;
export const nowOffset = (now: number, ds: number) => clockMin(new Date(now - ds * 60000));
export const anchorTs = (a: Pick<Anchor, 'time'>, key: string, ds: number) => dayStartTs(key, ds) + offsetOf(a.time, ds) * 60000;

// 그날 따라야 할 닻 (그날이 끝나기 전에 만든 활성 닻), 시각 순서
export function dayAnchors(s: State, key: string, ds: number): Anchor[] {
  const end = dayStartTs(key, ds) + DAY * 60000;
  return s.anchors
    .filter((a) => a.status === 'active' && a.createdAt < end)
    .sort((a, b) => offsetOf(a.time, ds) - offsetOf(b.time, ds));
}

// 닻이 "지금 할 것"으로 남아 있는 끝: 다음 닻의 시각과 3시간 뒤 중 이른 쪽.
// 그 뒤로는 "아까 했나요?"로 묻는다.
export function windowEnd(list: Anchor[], i: number, ds: number): number {
  const t = offsetOf(list[i].time, ds);
  const next = list[i + 1];
  return Math.min(next ? offsetOf(next.time, ds) : DAY, t + LAST_WINDOW);
}

// 닻을 따르기 시작한 시각: 설정한 때와 닻을 만든(다시 켠) 때 중 늦은 쪽
const startOf = (s: State, a: Anchor) => Math.max(s.profile.setupAt ?? 0, a.createdAt);
// 그날 안에서 시작 시각의 위치 (그날 이전에 시작했으면 -1)
const startOffIn = (start: number, key: string, ds: number) => (start >= dayStartTs(key, ds) ? nowOffset(start, ds) : -1);

export const wrapOffset = (p: Profile, ds: number) => Math.max(0, offsetOf(p.sleep, ds) - WRAP_LEAD);

export type NowView =
  | { kind: 'setup' }
  | { kind: 'yesterday'; anchor: Anchor; key: string }
  | { kind: 'due'; anchor: Anchor; key: string; late: boolean }
  | { kind: 'catchup'; anchor: Anchor; key: string }
  | { kind: 'wrapup'; key: string }
  | { kind: 'idle'; key: string; closed: boolean; next: { anchor: Anchor; at: number } | null };

export function selectNow(s: State, now: number): NowView {
  if (!s.profile.setupAt) return { kind: 'setup' };
  const ds = dayStartMin(s.profile);
  const key = logicalKey(now, ds);

  // 어제 결과를 모르는 닻 (예: 마감 뒤의 "눕기") → 아침에 한 번 묻는다
  const yKey = prevKey(key);
  const yEnd = dayStartTs(key, ds);
  if (s.profile.setupAt < yEnd) {
    const yDay = s.days[yKey] || emptyDay();
    const pending = dayAnchors(s, yKey, ds).find((a) => !yDay.outcomes[a.id] && startOf(s, a) < anchorTs(a, yKey, ds));
    if (pending) return { kind: 'yesterday', anchor: pending, key: yKey };
  }

  const day: Day = s.days[key] || emptyDay();
  const list = dayAnchors(s, key, ds);
  const off = nowOffset(now, ds);

  // 시각 순서대로: 결과가 없는 첫 닻이 지금 할 것(또는 "아까 했나요?")
  for (let i = 0; i < list.length; i++) {
    const a = list[i];
    if (day.outcomes[a.id]) continue;
    const t = offsetOf(a.time, ds);
    const end = windowEnd(list, i, ds);
    const sn = day.snoozes[a.id];
    if (sn != null) {
      if (now < sn) continue; // 미뤄 둔 중
      return { kind: 'due', anchor: a, key, late: off >= end }; // 미룬 시간이 끝나면 창이 지나도 다시 보여 준다
    }
    if (t > off) continue; // 아직
    if (end <= startOffIn(startOf(s, a), key, ds)) continue; // 따르기 전에 이미 지나간 닻
    if (off < end) return { kind: 'due', anchor: a, key, late: false };
    return { kind: 'catchup', anchor: a, key };
  }

  if (!day.closed && (day.wrapRequested || off >= wrapOffset(s.profile, ds))) return { kind: 'wrapup', key };

  const next = nextAnchor(s, key, ds, now);
  return { kind: 'idle', key, closed: day.closed, next };
}

export function nextAnchor(s: State, key: string, ds: number, now: number) {
  const day = s.days[key] || emptyDay();
  const off = nowOffset(now, ds);
  let best: { anchor: Anchor; at: number } | null = null;
  for (const a of dayAnchors(s, key, ds)) {
    if (day.outcomes[a.id]) continue;
    const sn = day.snoozes[a.id];
    const at = sn != null ? sn : offsetOf(a.time, ds) > off ? anchorTs(a, key, ds) : null;
    if (at == null || at <= now) continue;
    if (!best || at < best.at) best = { anchor: a, at };
  }
  return best;
}

export type Progress = 'done' | 'min' | 'skip' | 'missed' | 'due' | 'snoozed' | 'upcoming' | 'passed' | 'na';

export function dayProgress(s: State, key: string, now: number): { anchor: Anchor; state: Progress; at: number }[] {
  const ds = dayStartMin(s.profile);
  const day = s.days[key] || emptyDay();
  const list = dayAnchors(s, key, ds);
  const today = logicalKey(now, ds) === key;
  const off = today ? nowOffset(now, ds) : DAY;
  return list.map((a, i) => {
    const o = day.outcomes[a.id];
    const at = anchorTs(a, key, ds);
    if (o) return { anchor: a, state: o.status, at };
    const sn = day.snoozes[a.id];
    if (sn != null && now < sn) return { anchor: a, state: 'snoozed', at: sn };
    const t = offsetOf(a.time, ds);
    if (t > off) return { anchor: a, state: 'upcoming', at };
    const end = windowEnd(list, i, ds);
    if (sn == null && end <= startOffIn(startOf(s, a), key, ds)) return { anchor: a, state: 'na', at }; // 따르기 전에 지나감
    return { anchor: a, state: off < end || sn != null ? 'due' : 'passed', at };
  });
}

// 하루 마감에서 이유를 물을 닻: 안 했거나 못 했는데 이유가 없는 것
export function needsReason(s: State, key: string, now: number): Anchor[] {
  const day = s.days[key] || emptyDay();
  return dayProgress(s, key, now)
    .filter((p) => (p.state === 'skip' || p.state === 'missed' || p.state === 'passed') && !day.outcomes[p.anchor.id]?.reason)
    .map((p) => p.anchor);
}

// 내일 첫 닻
export function tomorrowFirst(s: State, key: string): Anchor | null {
  const ds = dayStartMin(s.profile);
  const d = keyToDate(key);
  d.setDate(d.getDate() + 1);
  return dayAnchors(s, dayKey(d), ds)[0] ?? null;
}
