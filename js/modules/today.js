// 시스템 프롬프트: 오늘의 한 문장, 가장 중요한 3가지, if-then 계획, 하루 종료 의식
import { store, getDay, peekDay, dayKey, keyToDate, lastDayKeys, openSession, activeRules, uid } from '../store.js';
import { h, card, textarea, input, field, btn, iconBtn, icon, focusNext, toast } from '../ui.js';
import { prefill, ruleLine } from './focus.js';

const WEEKDAY = ['일', '월', '화', '수', '목', '금', '토'];

export function render(s, ctx) {
  const key = dayKey();
  const day = peekDay(s, key);
  const now = new Date();
  const root = h('div', { class: 'stack' },
    h('header', { class: 'screen-head' },
      h('div', { class: 'layer' }, '시스템 프롬프트'),
      h('h1', {}, `${now.getMonth() + 1}월 ${now.getDate()}일 ${WEEKDAY[now.getDay()]}요일`),
      h('p', { class: 'muted' }, '목표와 제약을 먼저 정하면 나머지 하루가 그 위에서 돈다.')));

  if (!s.settings.onboarded) root.append(onboarding());
  const sig = signals(s, ctx, key);
  if (sig) root.append(sig);
  root.append(intentionCard(day, key), top3Card(day, key), ifThenCard(day, key), shutdownCard(s, day, key, ctx));
  return root;
}

function onboarding() {
  return card({ title: '사람에게 씌우는 하네스', cls: 'onboard' },
    h('p', {}, '같은 AI 모델도 지시, 도구, 메모리, 검증 루프를 어떻게 짜느냐에 따라 성능이 크게 달라진다. 이 앱은 그 구조를 사람에게 옮긴 것이다. 화면 하나가 하네스의 층 하나다.'),
    h('ol', { class: 'principles' },
      h('li', {}, h('strong', {}, '최소한으로. '), '실수가 실제로 나는 곳만 다룬다.'),
      h('li', {}, h('strong', {}, '스스로 고른다. '), '안 쓰는 모듈은 설정에서 끈다.'),
      h('li', {}, h('strong', {}, '피드백은 빠르게. '), '세션마다 기준 대비 결과를 확인한다.'),
      h('li', {}, h('strong', {}, '점점 줄인다. '), '몸에 익은 규칙과 습관은 졸업시킨다.')),
    h('p', { class: 'muted small' }, '시작은 간단하다. 아래에 오늘의 한 문장을 쓰고, 집중 탭에서 세션 하나를 돌려 보자. 어디서든 ＋ 버튼(또는 ⌘K)으로 생각을 캡처할 수 있다.'),
    btn('알겠어요', () => store.update((st) => { st.settings.onboarded = true; }), 'primary sm'));
}

// 최근 3일 안에 남긴 "내일의 첫 행동"만. 더 오래된 메모는 이미 의미가 없다.
function prevTomorrow(s, key) {
  const end = keyToDate(key);
  end.setDate(end.getDate() - 1);
  const k = lastDayKeys(3, end).reverse().find((x) => s.days[x]?.shutdown?.tomorrow?.trim());
  if (!k) return null;
  const d = keyToDate(k);
  return { text: s.days[k].shutdown.tomorrow, label: k === dayKey(end) ? '어제 정한 첫 행동' : `${d.getMonth() + 1}/${d.getDate()}에 정한 첫 행동` };
}

function signals(s, ctx, key) {
  const rows = [];
  const sess = openSession(s);
  if (sess) rows.push(sig('focus', sess.status === 'active' ? `집중 중: ${sess.goal}` : `검증 대기: ${sess.goal}`, () => ctx.navigate('focus'), 'live'));

  const tmr = prevTomorrow(s, key);
  const day = peekDay(s, key);
  // 오늘 세션을 이미 시작했다면 첫 행동은 끝난 것으로 본다.
  const startedToday = s.sessions.some((x) => dayKey(new Date(x.startAt)) === key);
  if (tmr && !sess && !startedToday && !day.shutdown.done) {
    rows.push(sig('arrow', h('span', {}, h('span', { class: 'muted' }, `${tmr.label} · `), tmr.text), () => {
      prefill({ firstAction: tmr.text });
      ctx.navigate('focus');
    }));
  }
  const inbox = s.captures.filter((c) => c.status === 'inbox').length;
  if (inbox && s.settings.modules.inbox) rows.push(sig('inbox', `정리 안 된 캡처 ${inbox}개`, () => ctx.navigate('inbox')));
  const checked = s.logs.some((l) => l.day === key);
  if (!checked && s.settings.modules.rhythm) rows.push(sig('rhythm', '오늘 컨디션 체크 아직', () => ctx.navigate('rhythm')));

  const rules = activeRules(s);
  if (!rows.length && !rules.length) return null;
  return card({ cls: 'signals' },
    rows.length > 0 && h('div', { class: 'sig-list' }, rows),
    rules.length > 0 && s.settings.modules.manual && h('div', { class: 'today-rules' },
      h('div', { class: 'mini-label' }, '오늘의 매뉴얼'),
      h('ul', { class: 'rule-list compact' }, rules.slice(0, 3).map(ruleLine))));
}

function sig(ic, text, onClick, cls = '') {
  return h('button', { type: 'button', class: `signal ${cls}`, onClick }, icon(ic, 18), h('span', { class: 'grow' }, text), icon('arrow', 16));
}

function intentionCard(day, key) {
  return card({ title: '오늘의 한 문장', sub: '오늘이 끝났을 때 무엇이 되어 있으면 좋은 하루인가?' },
    textarea({
      value: day.intention, placeholder: '예: 기획서 초안을 팀에 보낸다', cls: 'big',
      onInput: (v) => store.update((st) => { getDay(st, key).intention = v; }, { silent: true }),
    }));
}

function top3Card(day, key) {
  const edit = (id, fn, silent) => store.update((st) => {
    const it = getDay(st, key).top3.find((x) => x.id === id);
    if (it) fn(it);
  }, { silent });
  const list = h('ul', { class: 'checklist' },
    day.top3.map((item) => h('li', { class: item.done ? 'done' : '' },
      h('input', { type: 'checkbox', checked: item.done, 'aria-label': '완료', onChange: (e) => edit(item.id, (it) => { it.done = e.target.checked; }) }),
      input({ value: item.text, cls: 'bare', label: '할 일', onInput: (v) => edit(item.id, (it) => { it.text = v; }, true) }),
      iconBtn('x', '삭제', () => store.update((st) => { const d = getDay(st, key); d.top3 = d.top3.filter((x) => x.id !== item.id); })))));
  if (day.top3.length < 3) {
    list.append(h('li', { class: 'add' }, icon('plus', 18), input({
      placeholder: day.top3.length ? '추가 후 Enter' : '가장 중요한 일부터. 추가 후 Enter',
      cls: 'bare', fk: 'top3-add',
      onEnter: (v) => {
        if (!v.trim()) return;
        focusNext.key = 'top3-add';
        store.update((st) => { getDay(st, key).top3.push({ id: uid(), text: v.trim(), done: false }); });
      },
    })));
  }
  const doneN = day.top3.filter((x) => x.done).length;
  return card({ title: '가장 중요한 3가지', tag: day.top3.length ? `${doneN}/${day.top3.length}` : null, sub: '3개를 넘기지 않는다. 이것만 하면 성공인 하루.' },
    list,
    day.top3.length >= 3 && h('p', { class: 'hint' }, '꽉 찼다. 더 넣고 싶다면 무엇을 뺄지 먼저 정하자.'));
}

function ifThenCard(day, key) {
  const edit = (id, k, v) => store.update((st) => {
    const it = getDay(st, key).ifThen.find((x) => x.id === id);
    if (it) it[k] = v;
  }, { silent: true });
  return card({ title: 'If-then 계획', sub: '“만약 X이면 Y한다”로 미리 정해 두면, 그 순간에 의지력을 쓰지 않아도 된다.' },
    day.ifThen.length > 0 && h('div', { class: 'ifthen-list' }, day.ifThen.map((it) => h('div', { class: 'ifthen' },
      h('span', { class: 'kw' }, '만약'),
      input({ value: it.if, placeholder: '오후 3시에 졸리면', cls: 'bare', label: '상황', onInput: (v) => edit(it.id, 'if', v) }),
      h('span', { class: 'kw' }, '→'),
      input({ value: it.then, placeholder: '10분 걷는다', cls: 'bare', label: '행동', onInput: (v) => edit(it.id, 'then', v) }),
      iconBtn('x', '삭제', () => store.update((st) => { const d = getDay(st, key); d.ifThen = d.ifThen.filter((x) => x.id !== it.id); }))))),
    day.ifThen.length < 3 && btn('＋ 계획 추가', () => store.update((st) => { getDay(st, key).ifThen.push({ id: uid(), if: '', then: '' }); }), 'ghost sm'));
}

function shutdownCard(s, day, key, ctx) {
  const sd = day.shutdown;
  if (sd.done) {
    return card({ title: '하루 종료', tag: '완료', cls: 'muted-card' },
      sd.win && h('p', {}, h('span', { class: 'muted' }, '잘된 것 · '), sd.win),
      sd.tomorrow && h('p', {}, h('span', { class: 'muted' }, '내일 첫 행동 · '), sd.tomorrow),
      btn('다시 열기', () => store.update((st) => { getDay(st, key).shutdown.done = false; }), 'ghost sm'));
  }
  const inbox = s.captures.filter((c) => c.status === 'inbox').length;
  const doneN = day.top3.filter((x) => x.done).length;
  const edit = (k) => (v) => store.update((st) => { getDay(st, key).shutdown[k] = v; }, { silent: true });
  return card({ title: '하루 종료 의식', sub: '일을 머릿속에서 내려놓는 절차. 끝을 정하지 않으면 뇌는 퇴근하지 않는다.' },
    h('ul', { class: 'auto-checks' },
      h('li', { class: inbox === 0 ? 'ok' : '' }, icon(inbox === 0 ? 'check' : 'inbox', 16),
        inbox === 0 ? '캡처함 비움' : h('button', { type: 'button', class: 'link', onClick: () => ctx.navigate('inbox') }, `캡처 ${inbox}개 정리하기`)),
      h('li', { class: day.top3.length && doneN === day.top3.length ? 'ok' : '' }, icon('check', 16), `중요한 3가지 ${doneN}/${day.top3.length || 0}`)),
    field('오늘 잘된 것 하나', textarea({ value: sd.win, placeholder: '작아도 된다', onInput: edit('win') })),
    field('내일의 첫 행동', textarea({ value: sd.tomorrow, placeholder: '내일 아침, 생각 없이 바로 할 수 있게', onInput: edit('tomorrow') }), '내일 이 화면 맨 위에 뜬다.'),
    h('div', { class: 'row end' }, btn('오늘 종료', () => {
      store.update((st) => { getDay(st, key).shutdown.done = true; });
      toast('수고했어요. 오늘은 여기까지.');
    }, 'primary')));
}
