// 리소스 관리: 에너지 체크인으로 피크 시간을 찾고, 수면·움직임을 기록하고, 아주 작은 습관을 쌓는다.
import { store, uid, dayKey, getDay, peekDay, lastDayKeys, keyToDate } from '../store.js';
import { h, card, input, field, screenHeader, btn, iconBtn, chips, empty, toast, focusNext } from '../ui.js';

const ENERGY = [
  { value: 1, label: '1 바닥' }, { value: 2, label: '2 낮음' }, { value: 3, label: '3 보통' },
  { value: 4, label: '4 좋음' }, { value: 5, label: '5 최고' },
];
const BLOCKS = [
  { id: 'dawn', name: '새벽', from: 0, to: 6 },
  { id: 'am', name: '오전', from: 6, to: 12 },
  { id: 'pm', name: '오후', from: 12, to: 18 },
  { id: 'eve', name: '저녁', from: 18, to: 24 },
];
const WD = ['일', '월', '화', '수', '목', '금', '토'];

let habitDraft = { anchor: '', tiny: '' };

export function render(s, ctx) {
  const key = dayKey();
  const day = peekDay(s, key);
  const todayLogs = s.logs.filter((l) => l.day === key);
  const root = h('div', { class: 'stack' }, screenHeader('rhythm'));

  // 체크인
  root.append(card({ title: '지금 에너지는?', sub: '하루 2~3번, 탭 한 번. 쌓이면 나의 피크 시간이 보인다.', tag: todayLogs.length ? `오늘 ${todayLogs.length}회` : null },
    chips(ENERGY, null, (v) => {
      store.update((st) => st.logs.push({ id: uid(), at: Date.now(), day: key, hour: new Date().getHours(), energy: v }));
      toast('기록했습니다.');
    }, 'energy'),
    h('div', { class: 'row wrap gap' },
      field('어젯밤 수면', chips([5, 6, 7, 8, 9].map((n) => ({ value: n, label: n === 9 ? '9h+' : n === 5 ? '≤5h' : `${n}h` })), day.sleep, (v) => store.update((st) => { getDay(st, key).sleep = v; }))),
      field('오늘 몸을 움직였나', chips([{ value: true, label: '움직였다' }, { value: false, label: '아직' }], day.moved, (v) => store.update((st) => { getDay(st, key).moved = v; }))))));

  root.append(patternCard(s));
  root.append(habitsCard(s, key));
  return root;
}

function patternCard(s) {
  const since = Date.now() - 30 * 864e5;
  const logs = s.logs.filter((l) => l.at >= since);
  const stats = BLOCKS.map((b) => {
    const xs = logs.filter((l) => l.hour >= b.from && l.hour < b.to);
    return { ...b, n: xs.length, avg: xs.length ? xs.reduce((a, l) => a + l.energy, 0) / xs.length : 0 };
  });
  const enough = stats.filter((x) => x.n >= 2);
  const peak = enough.sort((a, b) => b.avg - a.avg)[0];

  const days = lastDayKeys(7);
  const sleepBars = h('div', { class: 'mini-bars' }, days.map((k) => {
    const d = s.days[k];
    const v = d?.sleep;
    return h('div', { class: 'mb' },
      h('div', { class: 'mb-track' }, h('div', { class: `mb-fill ${v != null && v < 7 ? 'low' : ''}`, style: { height: v ? `${(v / 9) * 100}%` : '0' } })),
      h('span', { class: `mb-label ${d?.moved ? 'moved' : ''}`, title: d?.moved ? '움직인 날' : '' }, WD[keyToDate(k).getDay()]));
  }));

  return card({ title: '나의 패턴', sub: '최근 30일 에너지 평균' },
    logs.length < 4
      ? empty(`체크인이 ${4 - logs.length}번 더 쌓이면 시간대별 패턴이 나온다.`)
      : h('div', {},
          h('div', { class: 'blocks' }, stats.map((b) => h('div', { class: `blk ${peak && b.id === peak.id ? 'peak' : ''}` },
            h('div', { class: 'blk-track' }, h('div', { class: 'blk-fill', style: { height: `${(b.avg / 5) * 100}%` } })),
            h('div', { class: 'blk-name' }, b.name),
            h('div', { class: 'muted small' }, b.n ? b.avg.toFixed(1) : '–')))),
          peak && h('p', { class: 'hint accent' }, `피크는 ${peak.name}(평균 ${peak.avg.toFixed(1)}). 가장 어려운 일은 이 시간에, 메일과 잡무는 바닥 시간에 두자.`)),
    h('div', { class: 'mini-label', style: { marginTop: '16px' } }, '최근 7일 수면 · 움직인 날은 점 표시'),
    sleepBars);
}

function streak(hb) {
  let n = 0;
  const d = new Date();
  if (!hb.done[dayKey(d)]) d.setDate(d.getDate() - 1); // 오늘 아직 안 했으면 어제부터 셈
  while (hb.done[dayKey(d)]) {
    n++;
    d.setDate(d.getDate() - 1);
  }
  return n;
}

function habitsCard(s, key) {
  const active = s.habits.filter((x) => x.status === 'active');
  const grads = s.habits.filter((x) => x.status === 'graduated');
  const days = lastDayKeys(7);
  const add = () => {
    if (!habitDraft.tiny.trim()) return toast('작은 행동을 적어 주세요.');
    const d = habitDraft;
    store.update((st) => st.habits.push({ id: uid(), anchor: d.anchor.trim(), tiny: d.tiny.trim(), status: 'active', done: {}, createdAt: Date.now() }));
    habitDraft = { anchor: '', tiny: '' };
    focusNext.key = 'habit-anchor';
  };
  const toggle = (id, k) => store.update((st) => {
    const x = st.habits.find((y) => y.id === id);
    if (x.done[k]) delete x.done[k];
    else x.done[k] = true;
  });

  return card({ title: '아주 작은 습관', sub: '이미 하는 일 뒤에 붙이고, 바보 같을 만큼 작게. 동기가 아니라 설계로 만든다.' },
    active.length
      ? h('ul', { class: 'habits' }, active.map((x) => h('li', {},
          h('div', { class: 'habit-head' },
            h('div', { class: 'grow' },
              x.anchor && h('span', { class: 'trigger' }, `${x.anchor} 후`),
              h('span', { class: 'rule-text' }, x.tiny)),
            h('span', { class: 'streak', title: '연속' }, `${streak(x)}일`)),
          h('div', { class: 'habit-row' },
            h('div', { class: 'week-dots' }, days.map((k) => h('button', {
              type: 'button', class: `wd ${x.done[k] ? 'on' : ''} ${k === key ? 'today' : ''}`,
              'aria-label': `${k} ${x.done[k] ? '완료' : '미완료'}`, 'aria-pressed': x.done[k] ? 'true' : 'false',
              onClick: () => toggle(x.id, k),
            }, WD[keyToDate(k).getDay()]))),
            h('div', { class: 'row tight' },
              Object.keys(x.done).length >= 21 && h('span', { class: 'muted small' }, '졸업할 때?'),
              btn('졸업', () => { store.update((st) => { st.habits.find((y) => y.id === x.id).status = 'graduated'; }); toast('졸업! 이제 하네스 없이도 된다.'); }, 'ghost sm'),
              iconBtn('x', '삭제', () => { if (confirm('이 습관을 지울까요?')) store.update((st) => { st.habits = st.habits.filter((y) => y.id !== x.id); }); }))))))
      : empty('습관이 없다. 하나만 시작하자.'),
    h('div', { class: 'rule-form' },
      field('이미 하는 일 (닻)', input({ value: habitDraft.anchor, placeholder: '예: 아침 커피를 내린', fk: 'habit-anchor', onInput: (v) => { habitDraft.anchor = v; }, onEnter: add })),
      field('아주 작은 행동', input({ value: habitDraft.tiny, placeholder: '예: 스쿼트 2개', onInput: (v) => { habitDraft.tiny = v; }, onEnter: add }))),
    h('div', { class: 'row end' }, btn('습관 추가', add, 'primary sm')),
    grads.length > 0 && h('p', { class: 'muted small' }, `졸업한 습관: ${grads.map((x) => x.tiny).join(', ')}`));
}
