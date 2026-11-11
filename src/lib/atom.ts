// 화면을 떠났다 돌아와도 남아 있어야 하는 작은 UI 상태 (작성 중인 초안, 선택한 탭 등).
// 저장소에 넣을 만큼은 아니고, 컴포넌트 state로는 화면 이동 때 사라진다.
import { useSyncExternalStore } from 'react';

export function atom<T>(initial: T) {
  let value = initial;
  const subs = new Set<() => void>();
  const a = {
    get: () => value,
    set(next: T | ((prev: T) => T)) {
      value = typeof next === 'function' ? (next as (p: T) => T)(value) : next;
      subs.forEach((f) => f());
    },
    subscribe(f: () => void) {
      subs.add(f);
      return () => { subs.delete(f); };
    },
  };
  return a;
}
export type Atom<T> = ReturnType<typeof atom<T>>;

export function useAtom<T>(a: Atom<T>): [T, Atom<T>['set']] {
  return [useSyncExternalStore(a.subscribe, a.get), a.set];
}
