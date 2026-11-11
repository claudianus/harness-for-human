// 화면이 상태를 바꾸는 방법. 모두 store.update 안에서 쓰는 순수한 변경 함수다.
import { getDay, type OutcomeStatus, type Reason, type State } from '../store/model';
import { needsReason } from './engine';
import { prescribe, type SetupAnswers } from './templates';

// 첫 설정(또는 다시 설정): 처방 닻으로 바꾼다. 예전 앱에서 옮겨 온 닻과 직접 만든 닻은 남긴다.
export function finishSetup(s: State, a: SetupAnswers, now: number) {
  s.profile = { setupAt: now, wake: a.wake, wakeIrregular: a.wakeIrregular, sleep: a.sleep, condition: a.condition, struggles: a.struggles };
  s.anchors = [...s.anchors.filter((x) => x.tpl === 'legacy' || x.tpl === 'custom'), ...prescribe(a, now)];
}

export function record(s: State, key: string, id: string, status: OutcomeStatus, now: number, late = false) {
  const d = getDay(s, key);
  d.outcomes[id] = { status, at: now, ...(late ? { late: true } : {}) };
  delete d.snoozes[id];
}

export function clearOutcome(s: State, key: string, id: string) {
  const d = getDay(s, key);
  delete d.outcomes[id];
  delete d.snoozes[id];
}

// 나중에: 정한 시각에 다시 보여 준다. 미룬 횟수를 센다.
export function snooze(s: State, key: string, id: string, until: number) {
  const d = getDay(s, key);
  d.snoozes[id] = until;
  d.snoozeCount[id] = (d.snoozeCount[id] || 0) + 1;
}

// 지금 할게요 / 미리 할래요: 미룬 횟수는 세지 않고 바로 지금 할 것으로
// (1분 앞당겨 적는다: 화면의 시계는 1초마다 갱신되므로, 누른 순간보다 조금 늦게 보일 수 있다)
export function bringForward(s: State, key: string, id: string, now: number) {
  getDay(s, key).snoozes[id] = now - 60_000;
}

export function requestWrap(s: State, key: string, on: boolean) {
  getDay(s, key).wrapRequested = on;
}

// 하루 마감: 지나간 닻은 "못 함"으로, 고른 이유를 붙인다.
export function closeDay(s: State, key: string, now: number, reasons: Record<string, Reason>) {
  const pending = needsReason(s, key, now);
  const d = getDay(s, key);
  for (const a of pending) {
    const o = d.outcomes[a.id] ?? { status: 'missed' as const, at: now };
    const r = reasons[a.id];
    d.outcomes[a.id] = r ? { ...o, reason: r } : o;
    delete d.snoozes[a.id];
  }
  d.closed = true;
  d.closedAt = now;
}

export function reopenDay(s: State, key: string) {
  const d = getDay(s, key);
  d.closed = false;
  d.wrapRequested = false;
  delete d.closedAt;
}
