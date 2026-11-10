// 도구: 구조화된 사고 템플릿. 자유 메모장이 아니라 정해진 질문 순서가 핵심이다.
import { store, uid } from '../store.js';
import { h, card, textarea, input, field, screenHeader, btn, iconBtn, chips, empty, timeAgo, focusNext, toast } from '../ui.js';

const SPARKS = [
  '다른 것으로 바꾸면? (대체)', '두 가지를 합치면? (결합)', '다른 분야의 방법을 가져오면? (적용)',
  '10배 크게 / 10분의 1로 줄이면?', '전혀 다른 용도로 쓰면?', '하나를 완전히 없애면?', '순서를 뒤집으면?',
  '예산이 0이라면?', '내일까지 해야 한다면?', '가장 나쁜 아이디어는? 그걸 뒤집으면?', '초보자라면 어떻게 할까?',
];

export const TOOLS = {
  premortem: {
    name: '프리모템', when: '큰 일을 시작하기 전',
    intro: '이미 실패했다고 가정하면 사람은 위험을 30% 가까이 더 잘 찾아낸다.',
    fields: [
      { k: 'goal', label: '무엇을 하려 하나?', type: 'text', ph: '예: 다음 달 사이드 프로젝트 출시' },
      { k: 'fails', label: '6개월 뒤, 완전히 실패했다. 왜?', type: 'list', ph: '실패 이유', hint: '최소 3개. 부끄러운 이유도 적자.' },
      { k: 'guards', label: '가장 그럴듯한 2개를 지금 막을 방법', type: 'list', ph: '대응책' },
    ],
  },
  whys: {
    name: '5 Whys', when: '같은 문제가 반복될 때',
    intro: '증상이 아니라 원인을 고친다. 다섯 번이 꼭 필요한 건 아니다. 손쓸 수 있는 원인이 나오면 멈춘다.',
    fields: [
      { k: 'problem', label: '문제', type: 'text', ph: '예: 마감 직전에 늘 밤을 새운다' },
      { k: 'whys', label: '왜?', type: 'chain', n: 5 },
      { k: 'action', label: '근본 원인에 대한 행동 하나', type: 'text', ph: '구체적으로, 이번 주 안에' },
    ],
  },
  brainstorm: {
    name: '브레인스토밍', when: '아이디어가 필요할 때',
    intro: '발산과 수렴을 분리한다. 먼저 양, 판단은 나중에.',
    fields: [
      { k: 'q', label: '질문', type: 'text', ph: '어떻게 하면 ~할 수 있을까?' },
      { k: 'ideas', label: '아이디어 (판단 금지, 10개 목표)', type: 'list', ph: '아이디어', spark: true },
      { k: 'picks', label: '고른 것 1~3개와 다음 행동', type: 'text', ph: '이제 판단할 시간' },
    ],
  },
  firstp: {
    name: '제1원리', when: '관성대로 풀리지 않을 때',
    intro: '당연한 것을 걷어내고 확실한 사실에서 다시 쌓는다.',
    fields: [
      { k: 'q', label: '풀려는 문제', type: 'text' },
      { k: 'assume', label: '당연하다고 믿는 가정들', type: 'list', ph: '가정' },
      { k: 'facts', label: '그중 확실한 사실만', type: 'list', ph: '사실' },
      { k: 'rebuild', label: '사실에서 다시 세운 해법', type: 'text' },
    ],
  },
  decision: {
    name: '결정 매트릭스', when: '선택지 사이에서 고민할 때',
    intro: '기준을 먼저 정하고 점수를 매기면 마지막에 끌리는 쪽이 아니라 중요한 쪽을 고르게 된다.',
    custom: true,
  },
};

let openId = null;

export function open(toolKey, seed = '') {
  const id = uid();
  openId = id;
  store.update((s) => {
    const data = initData(toolKey);
    if (seed) {
      if (toolKey === 'brainstorm') data.q = seed;
      else if (toolKey === 'decision') data.question = seed;
      else data[TOOLS[toolKey].fields[0].k] = seed;
    }
    s.thinks.unshift({ id, tool: toolKey, data, at: Date.now(), updatedAt: Date.now() });
  });
}

function initData(k) {
  if (k === 'decision') {
    return {
      question: '', reversible: null,
      options: [{ id: uid(), name: '' }, { id: uid(), name: '' }],
      criteria: [{ id: uid(), name: '', w: 2 }],
      scores: {},
    };
  }
  const d = {};
  for (const f of TOOLS[k].fields) d[f.k] = f.type === 'list' ? [''] : f.type === 'chain' ? Array(f.n).fill('') : '';
  return d;
}

function isEmpty(t) {
  const vals = [];
  const walk = (v) => {
    if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === 'object') Object.entries(v).filter(([k]) => k !== 'id').forEach(([, x]) => walk(x));
    else if (typeof v === 'string') vals.push(v.trim());
  };
  walk(t.data);
  return vals.every((v) => !v);
}

function titleOf(t) {
  const d = t.data;
  return (d.goal || d.problem || d.q || d.question || '').trim() || '(제목 없음)';
}

export function render(s, ctx) {
  const root = h('div', { class: 'stack' }, screenHeader('think'));
  const cur = openId && s.thinks.find((t) => t.id === openId);
  if (cur) {
    root.append(editor(cur, ctx));
    return root;
  }
  openId = null;
  root.append(h('div', { class: 'tool-grid' },
    Object.entries(TOOLS).map(([k, t]) => h('button', { type: 'button', class: 'tool', onClick: () => open(k) },
      h('strong', {}, t.name), h('span', { class: 'muted small' }, t.when)))));

  root.append(card({ title: '저장된 생각', tag: s.thinks.length ? `${s.thinks.length}개` : null },
    s.thinks.length
      ? h('ul', { class: 'history' }, s.thinks.slice(0, 20).map((t) => h('li', { class: 'clickable', onClick: () => { openId = t.id; ctx.rerender(); window.scrollTo(0, 0); } },
          h('span', { class: 'tag' }, TOOLS[t.tool]?.name || t.tool),
          h('span', { class: 'grow' }, titleOf(t)),
          h('span', { class: 'muted small' }, timeAgo(t.updatedAt)))))
      : empty('도구 하나를 골라 시작하자. 막힌 문제가 있다면 5 Whys가 가장 빠르다.')));
  return root;
}

function editor(t, ctx) {
  const tool = TOOLS[t.tool];
  const upd = (fn, silent = true) => store.update((s) => {
    const x = s.thinks.find((y) => y.id === t.id);
    if (x) { fn(x.data); x.updatedAt = Date.now(); }
  }, { silent });
  const close = () => {
    const x = store.get().thinks.find((y) => y.id === t.id);
    openId = null;
    if (x && isEmpty(x)) store.update((s) => { s.thinks = s.thinks.filter((y) => y.id !== t.id); });
    else ctx.rerender();
  };
  const body = tool.custom ? decisionEditor(t, upd) : tool.fields.map((f) => fieldEditor(t, f, upd));
  return card({ title: tool.name, tag: '도구', cls: 'editor' },
    h('p', { class: 'sub' }, tool.intro),
    body,
    h('div', { class: 'row between' },
      btn('삭제', () => { if (confirm('이 기록을 지울까요?')) { openId = null; store.update((s) => { s.thinks = s.thinks.filter((y) => y.id !== t.id); }); } }, 'ghost danger sm'),
      btn('저장하고 닫기', close, 'primary')));
}

function fieldEditor(t, f, upd) {
  const v = t.data[f.k];
  if (f.type === 'text') {
    return field(f.label, textarea({ value: v, placeholder: f.ph || '', rows: 2, onInput: (val) => upd((d) => { d[f.k] = val; }) }), f.hint);
  }
  if (f.type === 'chain') {
    return h('div', { class: 'fieldset' }, h('span', { class: 'label' }, f.label),
      h('ol', { class: 'chain' }, v.map((val, i) => h('li', {},
        textarea({ value: val, placeholder: i === 0 ? '왜 그런 일이 생기나?' : '그건 또 왜?', onInput: (x) => upd((d) => { d[f.k][i] = x; }) })))));
  }
  // list
  const fk = (i) => `${t.id}-${f.k}-${i}`;
  const sparkOut = h('p', { class: 'spark-out' });
  return h('div', { class: 'fieldset' },
    h('span', { class: 'label' }, f.label, f.type === 'list' && v.filter((x) => x.trim()).length > 0 && h('span', { class: 'count' }, ` ${v.filter((x) => x.trim()).length}`)),
    h('ul', { class: 'list-edit' }, v.map((val, i) => h('li', {},
      h('span', { class: 'num' }, i + 1),
      input({
        value: val, placeholder: f.ph || '', cls: 'bare', fk: fk(i),
        onInput: (x) => upd((d) => { d[f.k][i] = x; }),
        onEnter: () => { focusNext.key = fk(i + 1); upd((d) => { d[f.k].splice(i + 1, 0, ''); }, false); },
      }),
      v.length > 1 && iconBtn('x', '삭제', () => upd((d) => { d[f.k].splice(i, 1); }, false))))),
    h('div', { class: 'row' },
      btn('＋ 추가', () => { focusNext.key = fk(v.length); upd((d) => { d[f.k].push(''); }, false); }, 'ghost sm'),
      f.spark && btn('막히면: 자극 질문', () => { sparkOut.textContent = SPARKS[Math.floor(Math.random() * SPARKS.length)]; }, 'ghost sm')),
    f.spark && sparkOut,
    f.hint && h('span', { class: 'hint' }, f.hint));
}

function decisionEditor(t, upd) {
  const d = t.data;
  const total = (o) => d.criteria.reduce((a, c) => a + (Number(d.scores[`${o.id}:${c.id}`]) || 0) * c.w, 0);
  const max = d.criteria.reduce((a, c) => a + 5 * c.w, 0);
  const totals = d.options.map(total);
  const best = Math.max(...totals);

  const table = h('table', { class: 'matrix' },
    h('thead', {}, h('tr', {},
      h('th', {}, '기준 \\ 선택지'),
      d.options.map((o, oi) => h('th', {}, input({ value: o.name, placeholder: `선택지 ${oi + 1}`, cls: 'bare', onInput: (v) => upd((x) => { x.options[oi].name = v; }) }))))),
    h('tbody', {},
      d.criteria.map((c, ci) => h('tr', {},
        h('th', {},
          input({ value: c.name, placeholder: `기준 ${ci + 1}`, cls: 'bare', onInput: (v) => upd((x) => { x.criteria[ci].name = v; }) }),
          h('select', { class: 'weight', 'aria-label': '중요도', onChange: (e) => upd((x) => { x.criteria[ci].w = Number(e.target.value); }, false) },
            [1, 2, 3].map((w) => h('option', { value: w, selected: c.w === w ? 'selected' : null }, `×${w}`)))),
        d.options.map((o) => h('td', {},
          h('select', { class: 'score', 'aria-label': '점수', onChange: (e) => upd((x) => { x.scores[`${o.id}:${c.id}`] = Number(e.target.value) || 0; }, false) },
            h('option', { value: '' }, '–'),
            [1, 2, 3, 4, 5].map((n) => h('option', { value: n, selected: d.scores[`${o.id}:${c.id}`] === n ? 'selected' : null }, n))))))),
      h('tr', { class: 'total' }, h('th', {}, `합계 (최대 ${max})`),
        d.options.map((o, oi) => h('td', { class: totals[oi] === best && best > 0 ? 'best' : '' }, totals[oi])))));

  return [
    field('무엇을 결정하나?', textarea({ value: d.question, placeholder: '예: 이직 제안을 받아들일까?', onInput: (v) => upd((x) => { x.question = v; }) })),
    field('되돌릴 수 있는 결정인가?', chips([{ value: true, label: '되돌릴 수 있다' }, { value: false, label: '되돌리기 어렵다' }], d.reversible, (v) => upd((x) => { x.reversible = v; }, false))),
    d.reversible === true && h('p', { class: 'hint accent' }, '되돌릴 수 있는 결정은 70% 확신이면 충분하다. 오래 고민하는 비용이 더 크다. 빨리 정하고 결과를 보자.'),
    d.reversible === false && h('p', { class: 'hint' }, '되돌리기 어려운 결정이다. 매트릭스를 채운 뒤 하루 자고 다시 보자. 프리모템도 같이 해 보면 좋다.'),
    h('div', { class: 'matrix-wrap' }, table),
    h('div', { class: 'row' },
      d.options.length < 4 && btn('＋ 선택지', () => upd((x) => { x.options.push({ id: uid(), name: '' }); }, false), 'ghost sm'),
      d.criteria.length < 6 && btn('＋ 기준', () => upd((x) => { x.criteria.push({ id: uid(), name: '', w: 2 }); }, false), 'ghost sm'),
      d.options.length > 2 && btn('선택지 빼기', () => upd((x) => { x.options.pop(); }, false), 'ghost sm'),
      d.criteria.length > 1 && btn('기준 빼기', () => upd((x) => { x.criteria.pop(); }, false), 'ghost sm')),
    h('p', { class: 'hint' }, '점수는 1~5, 기준의 중요도는 ×1~×3. 합계가 마음과 다르게 나온다면, 빠진 기준이 있다는 신호다.'),
  ];
}

