import { describe, expect, it } from 'vitest';
import { addItem, closeDay, finishSetup, resolveItem, snoozeItem, triageItem } from '../core/actions';
import { dayReminders, dayStartMin, nextReminder, selectNow, slotAt, triageList } from '../core/engine';
import { whenLabel } from '../core/format';
import { notifyTargets } from '../core/notifier';
import { escapeText, itemIcs, routinesIcs } from '../core/ics';
import { defaultState, migrate, peekDay, type State } from '../store/model';

const at = (d: number, h: number, m = 0) => new Date(2026, 10, d, h, m).getTime();

function ready(): State {
  const s = defaultState();
  finishSetup(s, { wake: '09:00', wakeIrregular: false, sleep: '01:00', condition: 1, struggles: ['meal'] }, at(11, 6));
  return s;
}

describe('reminders and appointments', () => {
  it('shows a reminder at its time, ahead of routines', () => {
    const s = ready();
    const r = addItem(s, { text: '병원 전화', due: at(11, 9, 30) }, at(11, 8));
    expect(selectNow(s, at(11, 9, 10))).toMatchObject({ kind: 'due' }); // 아직은 물 한 컵
    expect(nextReminder(s, at(11, 9, 10))).toMatchObject({ item: { id: r.id }, at: at(11, 9, 30) });
    expect(selectNow(s, at(11, 9, 31))).toMatchObject({ kind: 'remind', item: { id: r.id }, late: false });
    snoozeItem(s, r.id, at(11, 9, 41));
    expect(selectNow(s, at(11, 9, 35)).kind).toBe('due');
    expect(selectNow(s, at(11, 9, 42)).kind).toBe('remind');
    resolveItem(s, r.id, 'done', at(11, 9, 43));
    expect(selectNow(s, at(11, 9, 44)).kind).toBe('due');
    expect(s.items[0]).toMatchObject({ status: 'done', doneAt: at(11, 9, 43) });
    expect(s.items[0].snooze).toBeUndefined();
  });

  it('tells you to leave early by the travel time, and asks what happened if long past', () => {
    const s = ready();
    addItem(s, { text: '치과', due: at(11, 15), travel: 30 }, at(11, 8));
    expect(selectNow(s, at(11, 14, 29)).kind).not.toBe('remind');
    expect(selectNow(s, at(11, 14, 31))).toMatchObject({ kind: 'remind', late: false });
    expect(selectNow(s, at(11, 16, 30))).toMatchObject({ kind: 'remind', late: true });
    expect(dayReminders(s, '2026-11-11', dayStartMin(s.profile)).map((i) => i.text)).toEqual(['치과']);
  });

  it('untimed items wait for the evening and can be sorted with one tap', () => {
    const s = ready();
    const a = addItem(s, { text: '엄마 선물' }, at(11, 10));
    const b = addItem(s, { text: '열쇠는 신발장 위' }, at(11, 10));
    const c = addItem(s, { text: '보험 서류' }, at(11, 10));
    const d = addItem(s, { text: '헬스장 알아보기' }, at(11, 10));
    expect(selectNow(s, at(11, 10, 5)).kind).not.toBe('remind');
    expect(triageList(s, at(11, 23, 40))).toHaveLength(3); // 한 번에 3개까지만 묻는다
    triageItem(s, a.id, 'tomorrow', at(11, 23, 40));
    triageItem(s, b.id, 'keep', at(11, 23, 40));
    triageItem(s, c.id, 'later', at(11, 23, 40));
    triageItem(s, d.id, 'drop', at(11, 23, 40));
    expect(triageList(s, at(11, 23, 41))).toEqual([]);
    expect(s.items.find((i) => i.id === a.id)!.due).toBe(at(12, 11)); // 내일 기상 2시간 뒤
    expect(s.items.find((i) => i.id === b.id)!.keep).toBe(true);
    expect(s.items.find((i) => i.id === d.id)).toBeUndefined(); // 버리면 정말 지워진다
    expect(triageList(s, at(15, 23, 0)).map((i) => i.id)).toEqual([c.id]); // 며칠 뒤 다시 묻는다
  });

  it('keeps a voice memo with empty text', () => {
    const s = ready();
    const i = addItem(s, { text: '  ', audio: { id: 'clip1', mime: 'audio/webm', ms: 4200 } }, at(11, 10));
    expect(i).toMatchObject({ text: '음성 메모', audio: { id: 'clip1' } });
  });
});

describe('journal', () => {
  it('saves mood and one line when the day is closed', () => {
    const s = ready();
    closeDay(s, '2026-11-11', at(11, 23, 40), {}, { mood: 4, note: '  산책했다  ' });
    expect(peekDay(s, '2026-11-11')).toMatchObject({ closed: true, mood: 4, note: '산책했다' });
  });
});

describe('saved data', () => {
  it('loads a step-1 save unchanged and defaults the new fields', () => {
    const old = { version: 3, createdAt: 1, profile: { setupAt: 5, wake: '09:00', sleep: '01:00', condition: 1, struggles: [] }, settings: { notify: true },
      anchors: [{ id: 'a', tpl: 'meal', title: 't', minimum: 'm', time: '13:00', target: 'full', status: 'active', createdAt: 5 }],
      days: { '2026-11-11': { outcomes: { a: { status: 'done', at: 9 } }, snoozes: {}, snoozeCount: {}, wrapRequested: false, closed: true, closedAt: 10 } },
      items: [{ id: 'i', text: '우유', at: 3, status: 'inbox' }] };
    const s = migrate(old);
    expect(s.items).toEqual([{ id: 'i', text: '우유', at: 3, status: 'inbox' }]);
    expect(s.days['2026-11-11']).toMatchObject({ closed: true, closedAt: 10, outcomes: { a: { status: 'done' } } });
    expect(s.days['2026-11-11'].mood).toBeUndefined();
  });

  it('round-trips every new field through save and load', () => {
    const s = ready();
    addItem(s, { text: '치과', due: at(12, 15), travel: 30, audio: { id: 'c', mime: 'audio/mp4', ms: 900 } }, at(11, 8));
    Object.assign(s.items[0], { snooze: 7, defer: 8, keep: true, doneAt: 9 });
    closeDay(s, '2026-11-11', at(11, 23, 40), {}, { mood: 2, note: '힘든 날' });
    const back = migrate(JSON.parse(JSON.stringify(s)));
    expect(back.items).toEqual(s.items);
    expect(back.days).toEqual(s.days);
    expect(migrate({ items: [{ text: 'x', status: 'weird', due: 'soon', audio: { id: '' } }] }).items[0]).toMatchObject({ status: 'inbox' });
  });
});

describe('calendar export', () => {
  const stamp = Date.UTC(2026, 10, 11, 0, 0, 0);
  it('writes a valid event with alarms for a reminder with travel time', () => {
    const s = ready();
    const i = addItem(s, { text: '치과; 2층, 접수\n먼저', due: at(12, 15), travel: 30 }, at(11, 8));
    const ics = itemIcs(i, stamp);
    expect(ics.split('\r\n').length).toBeGreaterThan(10);
    expect(ics.replace(/\r\n/g, '')).not.toContain('\n'); // 줄바꿈은 전부 CRLF
    expect(ics).toContain(`UID:item-${i.id}@human-harness\r\n`);
    expect(ics).toContain('DTSTART:20261112T150000\r\n');
    expect(ics).toContain('SUMMARY:치과\\; 2층\\, 접수\\n먼저\r\n');
    expect(ics).toContain('TRIGGER:-PT30M\r\n');
    expect(ics).toContain('TRIGGER:PT0M\r\n');
    expect(ics).toContain('DTSTAMP:20261111T000000Z\r\n');
    expect(ics.startsWith('BEGIN:VCALENDAR\r\n') && ics.endsWith('END:VCALENDAR\r\n')).toBe(true);
  });

  it('writes daily repeating events for active routines with stable ids', () => {
    const s = ready();
    s.anchors[1].status = 'paused';
    const ics = routinesIcs(s.anchors, new Date(2026, 10, 11), stamp);
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(2);
    expect(ics).toContain('RRULE:FREQ=DAILY\r\n');
    expect(ics).toContain(`UID:anchor-${s.anchors[0].id}@human-harness\r\n`);
    expect(ics).toContain('DTSTART:20261111T090000\r\n');
    expect(routinesIcs(s.anchors, new Date(2026, 10, 11), stamp)).toBe(ics);
  });

  it('folds long lines at 75 bytes', () => {
    const s = ready();
    const i = addItem(s, { text: '가'.repeat(60), due: at(12, 15) }, at(11, 8));
    const enc = new TextEncoder();
    for (const line of itemIcs(i, stamp).split('\r\n')) expect(enc.encode(line).length).toBeLessThanOrEqual(75);
    expect(escapeText('a\\b')).toBe('a\\\\b');
  });
});

describe('after midnight, before bed', () => {
  it('"tomorrow morning" means the morning after you sleep', () => {
    const s = ready(); // 09:00 기상, 01:00 취침
    const now = at(12, 0, 30); // 12일 새벽 0시 반 = 아직 11일 하루
    const ds = dayStartMin(s.profile);
    expect(slotAt(s, now, 1, '09:00')).toBe(at(12, 9));
    expect(slotAt(s, now, 0, '19:00')).toBe(at(11, 19)); // 오늘 저녁은 이미 지났다
    expect(whenLabel(at(12, 9), now, ds)).toBe('내일 오전 9시');
    expect(whenLabel(at(12, 1), now, ds)).toBe('오늘 새벽 1시');
    expect(whenLabel(at(12, 9), at(12, 8), ds)).toBe('오늘 오전 9시');
    expect(whenLabel(at(20, 15), now, ds)).toBe('11월 20일 오후 3시');
  });
});

describe('notifications', () => {
  it('nags an open reminder every 5 minutes, up to 30', () => {
    const s = ready();
    addItem(s, { text: '약 먹기', due: at(11, 10) }, at(11, 8));
    for (const tpl of ['wake_water']) s.days['2026-11-11'] = { ...peekDay(s, '2026-11-11'), outcomes: { [s.anchors.find((a) => a.tpl === tpl)!.id]: { status: 'done', at: 1 } } };
    const id = (m: number) => notifyTargets(s, at(11, 10, m))[0].id;
    expect(id(1)).toBe(id(4));
    expect(id(6)).not.toBe(id(4));
    expect(id(31)).toBe(id(59)); // 30분 뒤로는 더 보내지 않는다
  });

  it('an unanswered reminder does not block routine notifications', () => {
    const s = ready();
    addItem(s, { text: '약 먹기', due: at(11, 10) }, at(11, 8));
    s.days['2026-11-11'] = { ...peekDay(s, '2026-11-11'), outcomes: { [s.anchors[0].id]: { status: 'done', at: 1 } } };
    const t = notifyTargets(s, at(11, 13, 5)); // 알림은 3시간째 그대로, 끼니 시간이 됨
    expect(t.map((x) => x.tag)).toEqual(['remind', 'now']);
    expect(t[1].title).toContain('뭐든 챙겨 먹기');
  });

  it('says to leave when there is travel time', () => {
    const s = ready();
    addItem(s, { text: '치과', due: at(11, 15), travel: 30 }, at(11, 8));
    expect(notifyTargets(s, at(11, 14, 31))[0]).toMatchObject({ title: '🚪 지금 출발하세요 치과', loud: true });
  });
});
