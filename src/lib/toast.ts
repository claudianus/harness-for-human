import { atom } from './atom';

export const toastAtom = atom<{ msg: string; n: number } | null>(null);
let n = 0;
export function toast(msg: string) {
  toastAtom.set({ msg, n: ++n });
}
