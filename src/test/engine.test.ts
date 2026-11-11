import { describe, expect, it } from 'vitest';
import { dayProgress, dayStartMin, logicalKey, needsReason, selectNow, tomorrowFirst } from '../core/engine';
import { pickThird, prescribe } from '../core/templates';
import { defaultState, getDay, type State } from '../store/model';

const at = (d: number, h: number, m = 0) => new Date(2026, 10, d, h, m).getTime(); // 2026-11-d (local)

// 09:00 기상, 01:00 취침 → 하루 경계 05:00
function setup(setupAt = at(11, 6)): State {
  const s = defaultState();
  s.profile = { setupAt, wake: '09:00', wakeIrregular: false, sleep: '01:00', condition: 2, struggles: ['meal'] };
  s.anchors = prescribe(s.profile, setupAt - 1000);
  return s;
}
const ids = (s: State) => Object.fromEntries(s.anchors.map((a) => [a.tpl, a.id]));

describe('prescribe', () => {
  it('gives wake, struggle, sleep anchors with derived times', () => {
    const s = setup();
    expect(s.anchors.map((a) => [a.tpl, a.time])).toEqual([['wake_water', '09:00'], ['meal', '13:00'], ['sleep_wind', '01:00']]);
    expect(s.anchors.every((a) => a.target === 'full')).toBe(true);
  });
  it('falls back to meal when only wake/sleep struggles', () => {
    expect(pickThird(['wake', 'sleep'])).toBe('meal');
    expect(pickThird(['sleep', 'wash'])).toBe('wash');
  });
  it('targets minimum versions when nothing works', () => {
    const a = prescribe({ wake: '10:00', wakeIrregular: false, sleep: '02:00', condition: 3, struggles: [] });
    expect(a.every((x) => x.target === 'min')).toBe(true);
  });
});

describe('day boundary', () => {
  it('is the midpoint of sleep and wake', () => {
    expect(dayStartMin(setup().profile)).toBe(5 * 60);
    expect(dayStartMin({ ...setup().profile, sleep: '05:00', wake: '13:00' })).toBe(9 * 60);
    expect(dayStartMin({ ...setup().profile, sleep: '23:00', wake: '07:00' })).toBe(3 * 60);
  });
  it('puts 02:00 in the previous logical day', () => {
    expect(logicalKey(at(12, 2), 300)).toBe('2026-11-11');
    expect(logicalKey(at(12, 6), 300)).toBe('2026-11-12');
  });
});

describe('selectNow', () => {
  it('asks for setup first', () => {
    expect(selectNow(defaultState(), at(11, 10)).kind).toBe('setup');
  });

  it('is idle before the first anchor, then due at its time', () => {
    const s = setup();
    const v = selectNow(s, at(11, 8, 30));
    expect(v.kind).toBe('idle');
    if (v.kind === 'idle') expect(v.next?.anchor.tpl).toBe('wake_water');
    const d = selectNow(s, at(11, 9, 5));
    expect(d.kind === 'due' && d.anchor.tpl).toBe('wake_water');
  });

  it('asks "did you?" for an anchor whose window passed (late riser), oldest first', () => {
    const s = setup();
    const v = selectNow(s, at(11, 14));
    expect(v.kind === 'catchup' && v.anchor.tpl).toBe('wake_water');
    getDay(s, '2026-11-11').outcomes[ids(s).wake_water] = { status: 'missed', at: at(11, 14) };
    const v2 = selectNow(s, at(11, 14));
    expect(v2.kind === 'due' && v2.anchor.tpl).toBe('meal');
  });

  it('brings a snoozed anchor back when the snooze ends, even past its window', () => {
    const s = setup();
    const d = getDay(s, '2026-11-11');
    d.outcomes[ids(s).wake_water] = { status: 'done', at: at(11, 9) };
    d.snoozes[ids(s).meal] = at(11, 23, 30); // 13시 끼니를 23:30까지 미룸 (창은 01시까지)
    expect(selectNow(s, at(11, 15)).kind).toBe('idle');
    d.snoozes[ids(s).meal] = at(12, 1, 30); // 창(01:00)이 지난 뒤까지 미룸
    const v = selectNow(s, at(12, 1, 31));
    expect(v.kind === 'due' && v.anchor.tpl).toBe('meal');
    expect(v.kind === 'due' && v.late).toBe(true);
  });

  it('opens the wrap-up 90 minutes before bedtime, and still shows bedtime after closing', () => {
    const s = setup();
    const d = getDay(s, '2026-11-11');
    d.outcomes[ids(s).wake_water] = { status: 'done', at: 0 };
    d.outcomes[ids(s).meal] = { status: 'skip', at: 0 };
    expect(selectNow(s, at(11, 23)).kind).toBe('idle');
    expect(selectNow(s, at(11, 23, 30)).kind).toBe('wrapup');
    expect(needsReason(s, '2026-11-11', at(11, 23, 30)).map((a) => a.tpl)).toEqual(['meal']);
    d.closed = true;
    const after = selectNow(s, at(11, 23, 40));
    expect(after.kind === 'idle' && after.closed && after.next?.anchor.tpl).toBe('sleep_wind');
    const bed = selectNow(s, at(12, 1, 5)); // 같은 논리적 하루
    expect(bed.kind === 'due' && bed.anchor.tpl).toBe('sleep_wind');
  });

  it('asks about yesterday\'s unanswered bedtime the next morning', () => {
    const s = setup();
    const d = getDay(s, '2026-11-11');
    d.outcomes[ids(s).wake_water] = { status: 'done', at: 0 };
    d.outcomes[ids(s).meal] = { status: 'done', at: 0 };
    d.closed = true;
    const v = selectNow(s, at(12, 9, 30));
    expect(v.kind === 'yesterday' && v.anchor.tpl).toBe('sleep_wind');
    expect(v.kind === 'yesterday' && v.key).toBe('2026-11-11');
  });

  it('does not ask about anchors that passed before setup', () => {
    const s = setup(at(11, 15)); // 오늘 오후 3시에 설정
    s.anchors.forEach((a) => { a.createdAt = at(11, 15); });
    const v = selectNow(s, at(11, 15, 1));
    // 09시 물(창은 13시까지)은 설정 전에 지나갔으니 묻지 않고, 13시 끼니는 아직 창 안이라 지금 할 것
    expect(v.kind === 'due' && v.anchor.tpl).toBe('meal');
    const p = dayProgress(s, '2026-11-11', at(11, 15, 1));
    expect(p.find((x) => x.anchor.tpl === 'wake_water')?.state).toBe('na');
  });

  it('knows tomorrow\'s first anchor', () => {
    expect(tomorrowFirst(setup(), '2026-11-11')?.tpl).toBe('wake_water');
  });
});
