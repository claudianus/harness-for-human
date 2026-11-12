// 지금 알려야 할 것들. 순수 함수라 그대로 테스트한다. 실제로 보내는 일은 App이 한다.
import { peekDay, type State } from '../store/model';
import { selectNow, triggerAt, type NowView } from './engine';
import { iconOf } from './templates';

export interface Target { id: string; title: string; body: string; tag: string; loud: boolean }

const NAG_EVERY = 5 * 60000; // 맡긴 알림은 해결할 때까지 5분마다
const NAG_MAX = 6; // 최대 30분

function routine(s: State, v: NowView): Target | null {
  if (v.kind === 'due') {
    const sn = peekDay(s, v.key).snoozes[v.anchor.id];
    const min = v.anchor.target === 'min';
    return {
      id: `${v.key}:${v.anchor.id}:${sn ?? 'on'}`, tag: 'now', loud: false,
      title: `${iconOf(v.anchor)} ${min ? v.anchor.minimum : v.anchor.title}`,
      body: min ? '지금 할 시간이에요.' : `지금 할 시간이에요. 힘들면 ${v.anchor.minimum}만 하세요.`,
    };
  }
  if (v.kind === 'wrapup') return { id: `${v.key}:wrap`, tag: 'now', loud: false, title: '하루 마감', body: '1분이면 돼요. 오늘을 정리하고 내일 첫 할 일을 확인하세요.' };
  return null;
}

export function notifyTargets(s: State, now: number): Target[] {
  const v = selectNow(s, now);
  if (v.kind !== 'remind') {
    const t = routine(s, v);
    return t ? [t] : [];
  }
  const at = Math.max(triggerAt(v.item), v.item.snooze ?? 0);
  const bucket = Math.min(NAG_MAX, Math.floor((now - at) / NAG_EVERY));
  const leaving = !!v.item.travel && now < v.item.due!;
  const out: Target[] = [{
    id: `item:${v.item.id}:${at}:${bucket}`, tag: 'remind', loud: true,
    title: `${leaving ? '🚪 지금 출발하세요' : '⏰'} ${v.item.text}`,
    body: leaving ? `가는 데 ${v.item.travel}분 걸려요.` : '맡겨 두신 일이에요. 지금 할 시간입니다.',
  }];
  // 대답 안 한 알림이 루틴 알림을 막지 않도록, 알림이 없다고 치고 루틴도 본다
  const r = routine(s, selectNow({ ...s, items: [] }, now));
  if (r) out.push(r);
  return out;
}
