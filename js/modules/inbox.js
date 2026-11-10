// 컨텍스트 관리: 캡처한 것을 분류한다. 오늘 할 일 / 나중에 / 아이디어 / 버림
import { store, getDay, dayKey, uid, addCapture } from '../store.js';
import { h, card, input, screenHeader, btn, iconBtn, chips, empty, toast, timeAgo, focusNext } from '../ui.js';

let tab = 'inbox';

const TABS = [
  { value: 'inbox', label: '미처리' },
  { value: 'later', label: '나중에' },
  { value: 'idea', label: '아이디어' },
];

export function render(s, ctx) {
  const counts = Object.fromEntries(TABS.map((t) => [t.value, s.captures.filter((c) => c.status === t.value).length]));
  const items = s.captures.filter((c) => c.status === tab);
  const sessionGoal = (id) => s.sessions.find((x) => x.id === id)?.goal;

  const root = h('div', { class: 'stack' }, screenHeader('inbox'));
  root.append(card({},
    input({
      placeholder: '떠오른 것을 그대로. Enter로 저장', fk: 'inbox-add', cls: 'big',
      onEnter: (v) => {
        if (!v.trim()) return;
        focusNext.key = 'inbox-add';
        store.update((st) => addCapture(st, v));
      },
    }),
    h('p', { class: 'hint' }, '어디서든 상단 ＋ 버튼이나 ⌘K / Ctrl+K로 바로 캡처할 수 있다.')));

  root.append(chips(TABS.map((t) => ({ ...t, label: `${t.label}${counts[t.value] ? ` ${counts[t.value]}` : ''}` })), tab, (v) => { tab = v; ctx.rerender(); }, 'tabs'));

  const set = (id, fn) => store.update((st) => { const c = st.captures.find((x) => x.id === id); if (c) fn(c, st); });
  const toToday = (c, st) => {
    const d = getDay(st, dayKey());
    if (d.top3.length >= 3) {
      c.status = 'later';
      toast('오늘의 3가지가 꽉 차서 “나중에”로 옮겼습니다.');
    } else {
      d.top3.push({ id: uid(), text: c.text, done: false });
      c.status = 'done';
      toast('오늘의 중요한 일에 추가했습니다.');
    }
  };
  const remove = (id) => store.update((st) => { st.captures = st.captures.filter((x) => x.id !== id); });

  const actions = (c) => {
    if (tab === 'inbox') return [
      btn('오늘', () => set(c.id, toToday), 'ghost sm'),
      btn('나중에', () => set(c.id, (x) => { x.status = 'later'; }), 'ghost sm'),
      btn('아이디어', () => set(c.id, (x) => { x.status = 'idea'; }), 'ghost sm'),
      iconBtn('x', '버리기', () => remove(c.id)),
    ];
    if (tab === 'later') return [
      btn('오늘로', () => set(c.id, toToday), 'ghost sm'),
      iconBtn('x', '삭제', () => remove(c.id)),
    ];
    return [
      btn('생각 도구로', () => { ctx.openThink?.('brainstorm', c.text); }, 'ghost sm'),
      iconBtn('x', '삭제', () => remove(c.id)),
    ];
  };

  root.append(card({ cls: 'list-card' },
    items.length
      ? h('ul', { class: 'cap-items' }, items.map((c) => h('li', {},
          h('div', { class: 'grow' },
            h('div', {}, c.text),
            h('div', { class: 'meta' }, timeAgo(c.at), c.sessionId && sessionGoal(c.sessionId) && ` · 세션 중: ${sessionGoal(c.sessionId)}`)),
          h('div', { class: 'cap-actions' }, actions(c)))))
      : empty(tab === 'inbox' ? '비어 있다. 머릿속도 이만큼 가벼우면 좋겠다.' : '없음')));
  return root;
}
