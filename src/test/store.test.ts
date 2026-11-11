import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fixture from './fixtures/vanilla-backup.json';
import { LEGACY_KEY, STORAGE_KEY, defaultState, fromLegacy, migrate } from '../store/model';
import { SAVE_DELAY, createStore, type Store } from '../store/store';

describe('migrate (v3)', () => {
  it('normalizes a malformed v3 backup into a usable shape', () => {
    const s = migrate({
      profile: { setupAt: 5, wake: '9시', condition: 7, struggles: ['meal', 'nope'] },
      anchors: [{ title: 'x', time: 'bad', status: 'weird' }, 3],
      days: { '2026-11-11': { outcomes: { a: { status: 'zzz' }, b: 4 }, snoozes: { a: 'x', b: 5 } }, bad: {} },
      items: [{ text: 'hi' }, null],
    });
    expect(s.profile).toMatchObject({ setupAt: 5, wake: '09:00', condition: 1, struggles: ['meal'] });
    expect(s.anchors).toHaveLength(1);
    expect(s.anchors[0]).toMatchObject({ time: '12:00', status: 'active', target: 'full' });
    expect(Object.keys(s.days)).toEqual(['2026-11-11']);
    expect(s.days['2026-11-11'].outcomes).toEqual({ a: { status: 'missed', at: 0 } });
    expect(s.days['2026-11-11'].snoozes).toEqual({ b: 5 });
    expect(s.items).toHaveLength(1);
  });
});

describe('fromLegacy (v1/v2 → v3)', () => {
  it('keeps unsorted captures and active habits, drops the rest', () => {
    const s = fromLegacy(fixture);
    expect(s.items.map((i) => i.text)).toEqual(['우유 사기']);
    expect(s.anchors).toHaveLength(1);
    expect(s.anchors[0]).toMatchObject({ tpl: 'legacy', status: 'paused', minimum: '스쿼트 2개', title: '커피 후 스쿼트 2개' });
    expect(s.profile.setupAt).toBeNull();
    expect(Object.keys(s.days)).toEqual([]);
    expect('sessions' in s).toBe(false);
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
    for (let i = 0; i < 20; i++) store.update((s) => { s.items.push({ id: String(i), text: 'x', at: i, status: 'inbox' }); });
    expect(spy).not.toHaveBeenCalled();
    vi.advanceTimersByTime(SAVE_DELAY + 10);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!).items).toHaveLength(20);
    spy.mockRestore();
  });

  it('flushes pending writes when the page hides', () => {
    store.update((s) => { s.profile.wake = '07:00'; });
    window.dispatchEvent(new Event('pagehide'));
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!).profile.wake).toBe('07:00');
  });

  it('reports save failures once and recovery once', () => {
    const events: boolean[] = [];
    const on = (e: Event) => events.push((e as CustomEvent).detail.ok);
    window.addEventListener('harness:persist', on);
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('full', 'QuotaExceededError'); });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    store.update((s) => { s.profile.wake = '01:00'; });
    vi.advanceTimersByTime(SAVE_DELAY + 10);
    store.update((s) => { s.profile.wake = '02:00'; });
    vi.advanceTimersByTime(SAVE_DELAY + 10);
    spy.mockRestore();
    store.update((s) => { s.profile.wake = '03:00'; });
    vi.advanceTimersByTime(SAVE_DELAY + 10);
    expect(events).toEqual([false, true]);
    window.removeEventListener('harness:persist', on);
    warn.mockRestore();
  });

  it('adopts changes written by another tab', () => {
    const listener = vi.fn();
    store.subscribe(listener);
    const other = defaultState();
    other.items.push({ id: 'remote', text: '다른 탭', at: 1, status: 'inbox' });
    const json = JSON.stringify(other);
    localStorage.setItem(STORAGE_KEY, json);
    window.dispatchEvent(new StorageEvent('storage', { key: STORAGE_KEY, newValue: json, storageArea: localStorage }));
    expect(store.get().items[0].id).toBe('remote');
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('ignores the echo of its own write', () => {
    store.update((s) => { s.settings.notify = false; });
    store.flush();
    const listener = vi.fn();
    store.subscribe(listener);
    window.dispatchEvent(new StorageEvent('storage', { key: STORAGE_KEY, newValue: localStorage.getItem(STORAGE_KEY), storageArea: localStorage }));
    expect(listener).not.toHaveBeenCalled();
  });

  it('loads existing saved data on startup', () => {
    store.dispose();
    const saved = defaultState();
    saved.profile.setupAt = 123;
    saved.items.push({ id: 'i1', text: '저장됨', at: 1, status: 'inbox' });
    localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
    store = createStore(localStorage, window);
    expect(store.get().profile.setupAt).toBe(123);
    expect(store.get().items[0].id).toBe('i1');
    expect(Object.keys(localStorage).some((k) => k.includes('.corrupt-'))).toBe(false);
  });

  it('migrates v1 data once, writes v3, and leaves v1 untouched', () => {
    store.dispose();
    localStorage.clear();
    const v1 = JSON.stringify(fixture);
    localStorage.setItem(LEGACY_KEY, v1);
    store = createStore(localStorage, window);
    expect(store.get().items.map((i) => i.id)).toEqual(['c1']);
    expect(store.get().anchors.map((a) => [a.id, a.status])).toEqual([['h1', 'paused']]);
    expect(localStorage.getItem(LEGACY_KEY)).toBe(v1);
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!).items).toHaveLength(1);
    // 두 번째 시작: v3에서 읽고, 다시 옮기지 않는다
    store.update((s) => { s.items = []; });
    store.flush();
    store.dispose();
    store = createStore(localStorage, window);
    expect(store.get().items).toEqual([]);
  });

  it('imports a v1 backup through the legacy path', () => {
    store.importJSON(JSON.stringify(fixture));
    expect(store.get().items.map((i) => i.text)).toEqual(['우유 사기']);
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
