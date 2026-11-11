import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fixture from './fixtures/vanilla-backup.json';
import { STORAGE_KEY, dayKey, migrate, weekStart } from '../store/model';
import { SAVE_DELAY, createStore, type Store } from '../store/store';

describe('migrate', () => {
  it('opens a vanilla v1 backup unchanged', () => {
    const s = migrate(fixture);
    expect(s.settings.focusMin).toBe(50);
    expect(s.settings.modules.rhythm).toBe(false);
    expect(s.days['2026-11-10'].shutdown.tomorrow).toBe('리뷰 요청');
    expect(s.sessions[0]).toMatchObject({ id: 's1', verdict: 'partial', nextStep: '본문 쓰기' });
    expect(s.captures[0].sessionId).toBe('s1');
    expect(s.habits[0].done['2026-11-10']).toBe(true);
    expect(s.thinks[0].data.whys).toEqual(['a', '', '', '', '']);
    expect(s.reviews[0].change).toBe('메신저 끄기');
    // 새 설정은 기본값으로 채운다
    expect(s.settings.notify).toEqual({ timer: true, morning: '', evening: '' });
  });

  it('normalizes a malformed backup into a renderable shape', () => {
    const s = migrate({
      settings: { modules: 'x', notify: { morning: '9시' } },
      days: { '2026-11-11': { top3: [{ text: 1 }, null], shutdown: 3 }, bad: {} },
      sessions: [{ goal: 'g' }, 5, null],
      thinks: [{ tool: 'whys' }],
      logs: [{ energy: 4 }],
      habits: [{ tiny: 't' }],
      reviews: [{}],
    });
    expect(Object.keys(s.days)).toEqual(['2026-11-11']);
    const day = s.days['2026-11-11'];
    expect(day.top3).toHaveLength(1);
    expect(day.top3[0].text).toBe('');
    expect(day.shutdown).toEqual({ done: false, win: '', tomorrow: '' });
    expect(day.ifThen).toEqual([]);
    expect(s.sessions).toHaveLength(1);
    expect(s.sessions[0].status).toBe('done');
    expect(typeof s.sessions[0].id).toBe('string');
    expect(s.thinks[0].data).toEqual({});
    expect(s.logs[0].day).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(s.habits[0].done).toEqual({});
    expect(s.settings.notify.morning).toBe('');
    expect(Object.values(s.settings.modules).every(Boolean)).toBe(true);
  });

  it('keeps at least one module on', () => {
    const s = migrate({ settings: { modules: { today: false, focus: false, inbox: false, think: false, rhythm: false, manual: false, review: false } } });
    expect(s.settings.modules.today).toBe(true);
  });
});

describe('dates', () => {
  it('weekStart is Monday', () => {
    expect(dayKey(weekStart(new Date(2026, 10, 11)))).toBe('2026-11-09'); // 수 → 월
    expect(dayKey(weekStart(new Date(2026, 10, 15)))).toBe('2026-11-09'); // 일 → 같은 주 월
  });
});

describe('store persistence', () => {
  let store: Store;
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
    store = createStore(localStorage, window);
  });
  afterEach(() => {
    store.dispose();
    vi.useRealTimers();
  });

  it('batches many updates into one write', () => {
    const spy = vi.spyOn(Storage.prototype, 'setItem');
    for (let i = 0; i < 20; i++) store.update((s) => { s.settings.focusMin = i; });
    expect(spy).not.toHaveBeenCalled();
    vi.advanceTimersByTime(SAVE_DELAY + 10);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!).settings.focusMin).toBe(19);
    spy.mockRestore();
  });

  it('flushes pending writes when the page hides', () => {
    store.update((s) => { s.settings.focusMin = 90; });
    window.dispatchEvent(new Event('pagehide'));
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!).settings.focusMin).toBe(90);
  });

  it('reports save failures once and recovery once', () => {
    const events: boolean[] = [];
    const on = (e: Event) => events.push((e as CustomEvent).detail.ok);
    window.addEventListener('harness:persist', on);
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('full', 'QuotaExceededError'); });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    store.update((s) => { s.settings.focusMin = 1; });
    vi.advanceTimersByTime(SAVE_DELAY + 10);
    store.update((s) => { s.settings.focusMin = 2; });
    vi.advanceTimersByTime(SAVE_DELAY + 10);
    spy.mockRestore();
    store.update((s) => { s.settings.focusMin = 3; });
    vi.advanceTimersByTime(SAVE_DELAY + 10);
    expect(events).toEqual([false, true]);
    window.removeEventListener('harness:persist', on);
    warn.mockRestore();
  });

  it('adopts changes written by another tab', () => {
    const listener = vi.fn();
    store.subscribe(listener);
    const other = migrate({ settings: {}, captures: [{ id: 'remote', text: '다른 탭', status: 'inbox' }] });
    const json = JSON.stringify(other);
    localStorage.setItem(STORAGE_KEY, json);
    window.dispatchEvent(new StorageEvent('storage', { key: STORAGE_KEY, newValue: json, storageArea: localStorage }));
    expect(store.get().captures[0].id).toBe('remote');
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('ignores the echo of its own write', () => {
    store.update((s) => { s.settings.focusMin = 15; });
    store.flush();
    const listener = vi.fn();
    store.subscribe(listener);
    window.dispatchEvent(new StorageEvent('storage', { key: STORAGE_KEY, newValue: localStorage.getItem(STORAGE_KEY), storageArea: localStorage }));
    expect(listener).not.toHaveBeenCalled();
  });

  it('loads existing saved data on startup', () => {
    store.dispose();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(fixture));
    store = createStore(localStorage, window);
    expect(store.get().sessions[0].id).toBe('s1');
    expect(store.get().thinks).toHaveLength(1);
    expect(Object.keys(localStorage).some((k) => k.includes('.corrupt-'))).toBe(false);
  });

  it('keeps corrupt data aside instead of overwriting it', () => {
    store.dispose();
    localStorage.setItem(STORAGE_KEY, '{not json');
    store = createStore(localStorage, window);
    const kept = Object.keys(localStorage).filter((k) => k.startsWith(`${STORAGE_KEY}.corrupt-`));
    expect(kept).toHaveLength(1);
    expect(localStorage.getItem(kept[0])).toBe('{not json');
  });

  it('rejects files that are not backups', () => {
    expect(() => store.importJSON('{"hello":1}')).toThrow();
  });
});
