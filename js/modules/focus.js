// 에이전트 루프: 계획(목표·완료기준·첫 행동) → 실행(타이머, 잡생각은 캡처로) → 검증 → 다음 단계 메모
import { store, uid, openSession, activeRules, addCapture, addRule, weekStart } from '../store.js';
import { h, card, textarea, input, field, screenHeader, btn, chips, empty, toast, fmtClock, fmtDate, focusNext } from '../ui.js';

let draft = { goal: '', criteria: '', firstAction: '', plannedMin: null };
let lesson = '';

export function prefill(d) {
  draft = { ...draft, ...d };
}

export function render(s, ctx) {
  const root = h('div', { class: 'stack' }, screenHeader('focus'));
  const cur = openSession(s);
  if (!cur) root.append(...planView(s, ctx));
  else if (cur.status === 'active') root.append(...runView(s, cur, ctx));
  else root.append(...verifyView(s, cur, ctx));
  root.append(historyView(s));
  return root;
}

function rulesCard(s, ctx) {
  const rules = activeRules(s);
  if (!rules.length) {
    return card({ title: '시작 전 매뉴얼', tag: '메모리' },
      h('p', { class: 'muted' }, '아직 규칙이 없습니다. 세션이 끝날 때 교훈을 남기면 여기에 나타납니다.'),
      btn('매뉴얼 열기', () => ctx.navigate('manual'), 'ghost sm'));
  }
  return card({ title: '시작 전 매뉴얼', tag: `규칙 ${rules.length}개`, cls: 'rules-card' },
    h('ul', { class: 'rule-list compact' }, rules.slice(0, 5).map(ruleLine)),
    rules.length > 5 && h('p', { class: 'hint' }, `외 ${rules.length - 5}개 — 매뉴얼에서 확인`));
}

export function ruleLine(r) {
  return h('li', { class: 'rule' },
    r.trigger && h('span', { class: 'trigger' }, r.trigger),
    h('span', { class: 'rule-text' }, r.text));
}

function planView(s, ctx) {
  if (draft.plannedMin == null) draft.plannedMin = s.settings.focusMin;
  const out = [rulesCard(s, ctx)];

  const last = s.sessions.find((x) => x.status === 'done' && x.nextStep);
  if (last && draft.firstAction !== last.nextStep) {
    out.push(card({ title: '지난 세션에서 남긴 메모', tag: '이어하기', cls: 'accent-soft' },
      h('p', {}, h('span', { class: 'muted' }, `${last.goal} → `), h('strong', {}, last.nextStep)),
      btn('이어서 계획하기', () => {
        prefill({ goal: last.verdict === 'met' ? '' : last.goal, firstAction: last.nextStep });
        ctx.rerender();
      }, 'ghost sm')));
  }

  const set = (k) => (v) => { draft[k] = v; };
  out.push(card({ title: '세션 계획', sub: '시작 전 30초. 이 세 줄이 프롬프트다.' },
    field('목표', textarea({ value: draft.goal, placeholder: '예: 랜딩 페이지 카피 초안 쓰기', onInput: set('goal'), fk: 'goal' })),
    field('완료 기준', textarea({ value: draft.criteria, placeholder: '예: 헤드라인 3안 + 본문 1개가 문서에 있다', onInput: set('criteria') }),
      '끝났는지 누가 봐도 판단할 수 있게. 기준이 없으면 작업은 끝나지 않는다.'),
    field('첫 행동', textarea({ value: draft.firstAction, placeholder: '예: 경쟁사 랜딩 2개 열기', onInput: set('firstAction') }),
      '2분 안에 손이 움직일 수 있는 물리적인 행동.'),
    field('시간', chips([15, 25, 50, 90].map((m) => ({ value: m, label: `${m}분` })), draft.plannedMin, (m) => { draft.plannedMin = m; ctx.rerender(); })),
    h('div', { class: 'row end' }, btn('세션 시작', () => start(ctx), 'primary lg'))));
  return out;
}

function start() {
  if (!draft.goal.trim()) return toast('목표를 먼저 적어 주세요.');
  if (!draft.criteria.trim()) return toast('완료 기준을 먼저. 기준 없는 작업은 끝나지 않습니다.');
  const d = draft;
  store.update((s) => {
    s.sessions.unshift({
      id: uid(), goal: d.goal.trim(), criteria: d.criteria.trim(), firstAction: d.firstAction.trim(),
      plannedMin: d.plannedMin || s.settings.focusMin, startAt: Date.now(), status: 'active',
    });
  });
  draft = { goal: '', criteria: '', firstAction: '', plannedMin: null };
  window.scrollTo(0, 0);
}

function runView(s, cur, ctx) {
  const clock = h('div', { class: 'clock', 'aria-live': 'off' });
  const bar = h('div', { class: 'bar-fill' });
  const tick = () => {
    const total = cur.plannedMin * 60000;
    const left = cur.startAt + total - Date.now();
    clock.textContent = fmtClock(left);
    clock.classList.toggle('over', left < 0);
    bar.style.width = Math.min(100, ((total - left) / total) * 100) + '%';
  };
  tick();
  const t = setInterval(tick, 1000);
  ctx.onCleanup(() => clearInterval(t));

  const caps = s.captures.filter((c) => c.sessionId === cur.id);
  const capList = h('ul', { class: 'cap-list' }, caps.map((c) => h('li', {}, c.text)));
  const capInput = input({
    placeholder: '떠오른 생각, 할 일 → Enter로 던지고 계속',
    fk: 'run-cap',
    onEnter: (v, el) => {
      if (!v.trim()) return;
      focusNext.key = 'run-cap';
      store.update((st) => addCapture(st, v, cur.id));
    },
  });

  return [
    card({ cls: 'run' },
      h('div', { class: 'run-top' }, h('span', { class: 'tag live' }, '진행 중'), h('span', { class: 'muted small' }, `${cur.plannedMin}분 계획`)),
      clock,
      h('div', { class: 'bar' }, bar),
      h('dl', { class: 'brief' },
        h('dt', {}, '목표'), h('dd', {}, cur.goal),
        h('dt', {}, '완료 기준'), h('dd', {}, cur.criteria),
        cur.firstAction && h('dt', {}, '첫 행동'), cur.firstAction && h('dd', {}, cur.firstAction)),
      h('div', { class: 'row' },
        btn('끝내고 검증하기', () => store.update((st) => {
          const x = st.sessions.find((y) => y.id === cur.id);
          x.status = 'reviewing';
          x.endAt = Date.now();
        }), 'primary'),
        btn('+5분', () => store.update((st) => { st.sessions.find((y) => y.id === cur.id).plannedMin += 5; }), 'ghost'),
        btn('취소', () => {
          if (confirm('이 세션을 기록 없이 취소할까요?')) store.update((st) => { st.sessions = st.sessions.filter((y) => y.id !== cur.id); });
        }, 'ghost danger'))),
    card({ title: '컨텍스트 비우기', sub: '작업과 상관없는 생각은 여기에. 붙잡고 있으면 작업기억을 차지한다.', tag: '캡처' },
      capInput, capList),
  ];
}

const VERDICTS = [
  { value: 'met', label: '충족', cls: 'good' },
  { value: 'partial', label: '일부', cls: 'mid' },
  { value: 'missed', label: '미충족', cls: 'bad' },
];

function verifyView(s, cur, ctx) {
  const upd = (fn, silent = true) => store.update((st) => fn(st.sessions.find((y) => y.id === cur.id)), { silent });
  const mins = Math.round((cur.endAt - cur.startAt) / 60000);
  const caps = s.captures.filter((c) => c.sessionId === cur.id && c.status === 'inbox').length;
  return [
    card({ title: '검증', tag: `${mins}분 작업`, cls: 'verify' },
      h('p', { class: 'muted small' }, '시작할 때 정한 기준'),
      h('blockquote', {}, cur.criteria),
      field('기준을 충족했나?', chips(VERDICTS, cur.verdict, (v) => upd((x) => { x.verdict = v; }, false))),
      field(cur.verdict === 'met' ? '무엇이 잘 작동했나?' : '무엇이 막았나?',
        textarea({ value: cur.reflection, placeholder: cur.verdict === 'met' ? '예: 첫 행동을 아주 작게 잡았다' : '예: 자료가 흩어져 있어서 찾느라 20분', onInput: (v) => upd((x) => { x.reflection = v; }) })),
      field('다음 단계 메모', textarea({ value: cur.nextStep, placeholder: '다음에 이어서 할 첫 행동. 미래의 나에게 남기는 메모.', onInput: (v) => upd((x) => { x.nextStep = v; }) }),
        '다음 세션을 열면 이 메모가 맨 위에 뜬다.'),
      field('규칙으로 남길 교훈 (선택)', textarea({ value: lesson, placeholder: '예: 자료 수집은 세션 전에 따로 한다', onInput: (v) => { lesson = v; } }),
        '적으면 매뉴얼에 규칙으로 추가된다.'),
      caps > 0 && h('p', { class: 'hint' }, `이번 세션에서 캡처한 ${caps}개가 캡처함에서 기다리고 있다.`),
      h('div', { class: 'row end' }, btn('기록하고 마치기', () => {
        if (!store.get().sessions.find((y) => y.id === cur.id).verdict) return toast('기준 충족 여부를 골라 주세요.');
        const l = lesson.trim();
        store.update((st) => {
          const x = st.sessions.find((y) => y.id === cur.id);
          x.status = 'done';
          if (l) addRule(st, l, '', 'session');
        });
        lesson = '';
        window.scrollTo(0, 0);
        toast(l ? '기록 완료. 교훈이 매뉴얼에 추가됐습니다.' : '기록 완료.');
      }, 'primary lg'))),
  ];
}

function historyView(s) {
  const done = s.sessions.filter((x) => x.status === 'done');
  const ws = weekStart().getTime();
  const week = done.filter((x) => x.startAt >= ws);
  const met = week.filter((x) => x.verdict === 'met').length;
  const mins = week.reduce((a, x) => a + Math.round((x.endAt - x.startAt) / 60000), 0);
  const label = { met: '충족', partial: '일부', missed: '미충족' };
  return card({ title: '기록', tag: week.length ? `이번 주 ${week.length}회 · ${mins}분 · 충족 ${Math.round((met / week.length) * 100)}%` : null },
    done.length
      ? h('ul', { class: 'history' }, done.slice(0, 8).map((x) => h('li', {},
          h('span', { class: `dot ${x.verdict}` , title: label[x.verdict] }),
          h('span', { class: 'grow' }, x.goal),
          h('span', { class: 'muted small' }, `${fmtDate(x.startAt)} · ${Math.round((x.endAt - x.startAt) / 60000)}분`))))
      : empty('첫 세션을 시작해 보세요. 기록이 쌓이면 회고에서 패턴이 보입니다.'));
}

