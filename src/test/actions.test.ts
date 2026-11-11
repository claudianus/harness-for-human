import { describe, expect, it } from 'vitest';
import { bringForward, closeDay, finishSetup, record, reopenDay, snooze } from '../core/actions';
import { dayProgress, selectNow } from '../core/engine';
import { defaultState, peekDay, type State } from '../store/model';

const at = (d: number, h: number, m = 0) => new Date(2026, 10, d, h, m).getTime();
const K = '2026-11-11';

function ready(): State {
  const s = defaultState();
  s.anchors.push({ id: 'old', tpl: 'legacy', title: '커피 후 스쿼트', minimum: '스쿼트 2개', time: '12:00', target: 'full', status: 'paused', createdAt: 1 });
  finishSetup(s, { wake: '09:00', wakeIrregular: false, sleep: '01:00', condition: 1, struggles: ['meal'] }, at(11, 6));
  return s;
}
const id = (s: State, tpl: string) => s.anchors.find((a) => a.tpl === tpl)!.id;

describe('actions', () => {
  it('finishSetup prescribes 3 anchors and keeps legacy ones; re-running replaces only prescribed', () => {
    const s = ready();
    expect(s.anchors.map((a) => a.tpl)).toEqual(['legacy', 'wake_water', 'meal', 'sleep_wind']);
    finishSetup(s, { wake: '07:00', wakeIrregular: false, sleep: '23:00', condition: 3, struggles: ['wash'] }, at(11, 7));
    expect(s.anchors.map((a) => [a.tpl, a.time, a.target])).toEqual([
      ['legacy', '12:00', 'full'], ['wake_water', '07:00', 'min'], ['wash', '07:30', 'min'], ['sleep_wind', '23:00', 'min'],
    ]);
  });

  it('a full day: do, snooze, come back, close with reasons', () => {
    const s = ready();
    // 09:10 물 → 했어요
    expect(selectNow(s, at(11, 9, 10))).toMatchObject({ kind: 'due', anchor: { tpl: 'wake_water' } });
    record(s, K, id(s, 'wake_water'), 'done', at(11, 9, 10));
    // 13:05 끼니 → 20분 뒤
    expect(selectNow(s, at(11, 13, 5))).toMatchObject({ kind: 'due', anchor: { tpl: 'meal' } });
    snooze(s, K, id(s, 'meal'), at(11, 13, 25));
    expect(selectNow(s, at(11, 13, 10)).kind).toBe('idle');
    expect(selectNow(s, at(11, 13, 26))).toMatchObject({ kind: 'due', anchor: { tpl: 'meal' } });
    expect(peekDay(s, K).snoozeCount[id(s, 'meal')]).toBe(1);
    // 그대로 잊음 → 23:30 마감
    const v = selectNow(s, at(11, 23, 30));
    expect(v).toMatchObject({ kind: 'due', anchor: { tpl: 'meal' }, late: true }); // 미룬 건 마감보다 먼저 다시 묻는다
    record(s, K, id(s, 'meal'), 'skip', at(11, 23, 31));
    expect(selectNow(s, at(11, 23, 32)).kind).toBe('wrapup');
    closeDay(s, K, at(11, 23, 33), { [id(s, 'meal')]: 'big' });
    expect(peekDay(s, K).outcomes[id(s, 'meal')]).toMatchObject({ status: 'skip', reason: 'big' });
    expect(peekDay(s, K).closed).toBe(true);
    // 마감 뒤에도 01:00 눕기는 나온다
    expect(selectNow(s, at(12, 1, 0))).toMatchObject({ kind: 'due', anchor: { tpl: 'sleep_wind' } });
    reopenDay(s, K);
    expect(peekDay(s, K).closed).toBe(false);
  });

  it('closeDay marks passed anchors as missed', () => {
    const s = ready();
    closeDay(s, K, at(11, 23, 40), {});
    const d = peekDay(s, K);
    expect(d.outcomes[id(s, 'wake_water')]).toMatchObject({ status: 'missed' });
    expect(d.outcomes[id(s, 'meal')]).toMatchObject({ status: 'missed' });
    expect(d.outcomes[id(s, 'sleep_wind')]).toBeUndefined(); // 아직 시간이 안 됨
  });

  it('bringForward makes an upcoming anchor due now without counting a snooze', () => {
    const s = ready();
    record(s, K, id(s, 'wake_water'), 'done', at(11, 9));
    bringForward(s, K, id(s, 'meal'), at(11, 10));
    expect(selectNow(s, at(11, 10))).toMatchObject({ kind: 'due', anchor: { tpl: 'meal' }, late: false });
    expect(peekDay(s, K).snoozeCount[id(s, 'meal')]).toBeUndefined();
  });
});

describe('resuming a paused routine', () => {
  it('counts only from the moment it was resumed', () => {
    const s = ready();
    // 13일 15:00에 예전 습관(12:00)을 다시 켠다
    const old = s.anchors.find((a) => a.id === 'old')!;
    old.status = 'active';
    old.createdAt = new Date(2026, 10, 13, 15).getTime();
    for (const tpl of ['wake_water', 'meal']) record(s, '2026-11-13', id(s, tpl), 'done', new Date(2026, 10, 13, 14).getTime());
    for (const tpl of ['wake_water', 'meal', 'sleep_wind']) record(s, '2026-11-12', id(s, tpl), 'done', new Date(2026, 10, 13, 1).getTime());
    const v = selectNow(s, new Date(2026, 10, 13, 15, 5).getTime());
    expect(v.kind).toBe('idle'); // "아까 했나요?"도 "어제 했나요?"도 없다
    expect(dayProgress(s, '2026-11-12', new Date(2026, 10, 13, 15, 5).getTime()).map((p) => p.anchor.id)).not.toContain('old');
    expect(dayProgress(s, '2026-11-13', new Date(2026, 10, 13, 15, 5).getTime()).find((p) => p.anchor.id === 'old')?.state).toBe('na');
    // 다음 날에는 정상으로 나온다
    record(s, '2026-11-13', id(s, 'sleep_wind'), 'done', new Date(2026, 10, 14, 1).getTime());
    record(s, '2026-11-14', id(s, 'wake_water'), 'done', new Date(2026, 10, 14, 9).getTime());
    expect(selectNow(s, new Date(2026, 10, 14, 12, 5).getTime())).toMatchObject({ kind: 'due', anchor: { id: 'old' } });
  });
});
