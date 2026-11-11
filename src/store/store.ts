// 단일 데이터 저장소. 모든 모듈이 같은 상태를 공유해야
// 회고 → 매뉴얼 → 집중 세션 같은 루프가 이어진다.
//
// - 변경은 Immer로 (초안을 고치듯 쓰고, 결과는 새 객체 → React가 다시 그린다)
// - 저장은 300ms 모았다가 한 번에, 탭이 닫히거나 가려지면 즉시
// - 다른 탭에서 저장하면 storage 이벤트로 받아 온다
// - 저장 실패는 'harness:persist' 이벤트로 알린다 (화면에 배너)
import { produce } from 'immer';
import { useSyncExternalStore } from 'react';
import { STORAGE_KEY, defaultState, isBackup, migrate, type State } from './model';

export const SAVE_DELAY = 300;

export interface PersistEventDetail { ok: boolean; error?: unknown }

export function createStore(storage: Storage = window.localStorage, target: Window = window) {
  // load()가 lastWritten을 쓰므로 선언이 먼저 와야 한다.
  const subs = new Set<() => void>();
  let saveTimer: ReturnType<typeof setTimeout> | null = null;
  let lastWritten: string | null = null;
  let failing = false;
  let state: State = load();

  function load(): State {
    let raw: string | null = null;
    try {
      raw = storage.getItem(STORAGE_KEY);
      lastWritten = raw;
      return raw ? migrate(JSON.parse(raw)) : defaultState();
    } catch {
      // 깨진 데이터를 새 기본값으로 덮어쓰기 전에 따로 보관해 둔다.
      try { if (raw) storage.setItem(`${STORAGE_KEY}.corrupt-${Date.now()}`, raw); } catch { /* noop */ }
      return defaultState();
    }
  }

  function report(ok: boolean, error?: unknown) {
    target.dispatchEvent(new CustomEvent<PersistEventDetail>('harness:persist', { detail: { ok, error } }));
  }

  function writeNow() {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = null;
    try {
      const json = JSON.stringify(state);
      storage.setItem(STORAGE_KEY, json);
      lastWritten = json;
      if (failing) { failing = false; report(true); }
    } catch (e) {
      console.warn('저장 실패', e);
      if (!failing) { failing = true; report(false, e); }
    }
  }
  function schedule() {
    if (!saveTimer) saveTimer = setTimeout(writeNow, SAVE_DELAY);
  }
  function emit() {
    subs.forEach((f) => f());
  }
  const flush = () => { if (saveTimer) writeNow(); };

  const onPageHide = () => flush();
  const onVisibility = () => { if (target.document.hidden) flush(); };
  // 다른 탭(또는 설치한 앱 창)에서 바꾼 내용을 받아 온다. 받지 않으면 서로의 기록을 덮어쓴다.
  const onStorage = (e: StorageEvent) => {
    if (e.key !== STORAGE_KEY || e.storageArea !== storage) return;
    if (e.newValue === lastWritten) return;
    if (e.newValue == null) state = defaultState();
    else {
      try { state = migrate(JSON.parse(e.newValue)); } catch { return; }
    }
    lastWritten = e.newValue;
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = null;
    emit();
  };
  target.addEventListener('pagehide', onPageHide);
  target.document.addEventListener('visibilitychange', onVisibility);
  target.addEventListener('storage', onStorage);

  return {
    get: () => state,
    update(fn: (draft: State) => void) {
      const next = produce(state, fn);
      if (next === state) return;
      state = next;
      schedule();
      emit();
    },
    subscribe(f: () => void) {
      subs.add(f);
      return () => { subs.delete(f); };
    },
    exportJSON: () => JSON.stringify(state, null, 2),
    importJSON(text: string) {
      const parsed: unknown = JSON.parse(text);
      if (!isBackup(parsed)) throw new Error('휴먼 하네스 백업 파일이 아닙니다.');
      state = migrate(parsed);
      writeNow();
      emit();
    },
    reset() {
      state = defaultState();
      writeNow();
      emit();
    },
    flush,
    dispose() {
      flush();
      target.removeEventListener('pagehide', onPageHide);
      target.document.removeEventListener('visibilitychange', onVisibility);
      target.removeEventListener('storage', onStorage);
    },
  };
}

export type Store = ReturnType<typeof createStore>;

export const store: Store = createStore();

export function useStore(): State;
export function useStore<T>(select: (s: State) => T): T;
export function useStore<T>(select?: (s: State) => T) {
  return useSyncExternalStore(store.subscribe, () => (select ? select(store.get()) : store.get()));
}
