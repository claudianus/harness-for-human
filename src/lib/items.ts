// 맡긴 것을 완전히 지운다: 기록과 녹음 소리를 함께.
import { removeItem } from '../core/actions';
import type { Item } from '../store/model';
import { store } from '../store/store';
import { deleteClip } from './audio';

export function deleteItem(i: Pick<Item, 'id' | 'audio'>) {
  if (i.audio) void deleteClip(i.audio.id).catch(() => {});
  store.update((s) => removeItem(s, i.id));
}
