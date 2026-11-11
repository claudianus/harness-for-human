// 도구: 구조화된 사고 템플릿. 자유 메모장이 아니라 정해진 질문 순서가 핵심이다.
import { useLayoutEffect, useRef, useState } from 'react';
import { Btn, Card, Chips, Empty, Field, IconBtn, ScreenHeader, TextArea, TextInput } from '../components/ui';
import { atom, useAtom } from '../lib/atom';
import { timeAgo } from '../lib/time';
import { toast } from '../lib/toast';
import { uid, type Think as ThinkRec } from '../store/model';
import { store, useStore } from '../store/store';

const SPARKS = [
  '다른 것으로 바꾸면? (대체)', '두 가지를 합치면? (결합)', '다른 분야의 방법을 가져오면? (적용)',
  '10배 크게 / 10분의 1로 줄이면?', '전혀 다른 용도로 쓰면?', '하나를 완전히 없애면?', '순서를 뒤집으면?',
  '예산이 0이라면?', '내일까지 해야 한다면?', '가장 나쁜 아이디어는? 그걸 뒤집으면?', '초보자라면 어떻게 할까?',
];

type FieldDef =
  | { k: string; label: string; type: 'text'; ph?: string; hint?: string }
  | { k: string; label: string; type: 'list'; ph?: string; hint?: string; spark?: boolean }
  | { k: string; label: string; type: 'chain'; n: number };

interface Tool { name: string; when: string; intro: string; fields?: FieldDef[]; custom?: boolean }

export const TOOLS: Record<string, Tool> = {
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

interface Decision {
  question: string;
  reversible: boolean | null;
  options: { id: string; name: string }[];
  criteria: { id: string; name: string; w: number }[];
  scores: Record<string, number>;
}

const openIdAtom = atom<string | null>(null);

function initData(k: string): Record<string, unknown> {
  if (k === 'decision') {
    const d: Decision = {
      question: '', reversible: null,
      options: [{ id: uid(), name: '' }, { id: uid(), name: '' }],
      criteria: [{ id: uid(), name: '', w: 2 }],
      scores: {},
    };
    return d as unknown as Record<string, unknown>;
  }
  const d: Record<string, unknown> = {};
  for (const f of TOOLS[k].fields!) d[f.k] = f.type === 'list' ? [''] : f.type === 'chain' ? Array(f.n).fill('') : '';
  return d;
}

// 가져온 백업에 빠진 칸이 있어도 편집기가 깨지지 않게 도구 정의에 맞춰 채운다.
function normalize(tool: string, data: Record<string, unknown>): Record<string, unknown> {
  const base = initData(tool);
  const strs = (v: unknown) => (Array.isArray(v) ? v.map((x) => (typeof x === 'string' ? x : '')) : null);
  if (tool === 'decision') {
    const d = data as Partial<Decision>;
    const b = base as unknown as Decision;
    return {
      ...data,
      question: typeof d.question === 'string' ? d.question : '',
      reversible: typeof d.reversible === 'boolean' ? d.reversible : null,
      options: Array.isArray(d.options) && d.options.length ? d.options : b.options,
      criteria: Array.isArray(d.criteria) && d.criteria.length ? d.criteria : b.criteria,
      scores: d.scores && typeof d.scores === 'object' ? d.scores : {},
    };
  }
  const out: Record<string, unknown> = { ...data };
  for (const f of TOOLS[tool].fields!) {
    if (f.type === 'text') out[f.k] = typeof data[f.k] === 'string' ? data[f.k] : '';
    else {
      let xs = strs(data[f.k]) ?? (base[f.k] as string[]);
      if (f.type === 'list' && !xs.length) xs = [''];
      if (f.type === 'chain' && xs.length < f.n) xs = [...xs, ...Array(f.n - xs.length).fill('')];
      out[f.k] = xs;
    }
  }
  return out;
}

function isEmpty(t: ThinkRec) {
  const vals: string[] = [];
  const walk = (v: unknown) => {
    if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === 'object') Object.entries(v).filter(([k]) => k !== 'id').forEach(([, x]) => walk(x));
    else if (typeof v === 'string') vals.push(v.trim());
  };
  walk(t.data);
  return vals.every((v) => !v);
}

function titleOf(t: ThinkRec) {
  const d = t.data as Record<string, unknown>;
  const pick = [d.goal, d.problem, d.q, d.question].find((x) => typeof x === 'string' && x.trim());
  return (pick as string | undefined)?.trim() || '(제목 없음)';
}

export function openTool(tool: string, seed = '') {
  const id = uid();
  store.update((s) => {
    const data = initData(tool);
    if (seed) {
      if (tool === 'brainstorm') data.q = seed;
      else if (tool === 'decision') data.question = seed;
      else data[TOOLS[tool].fields![0].k] = seed;
    }
    s.thinks.unshift({ id, tool, data, at: Date.now(), updatedAt: Date.now() });
  });
  openIdAtom.set(id);
}

// 다른 화면으로 나가면 편집기를 닫는다. 아무것도 적지 않았다면 기록도 남기지 않는다.
export function leaveThink() {
  const id = openIdAtom.get();
  if (!id) return;
  openIdAtom.set(null);
  const x = store.get().thinks.find((y) => y.id === id);
  if (x && isEmpty(x)) store.update((s) => { s.thinks = s.thinks.filter((y) => y.id !== id); });
}

export default function Think() {
  const s = useStore();
  const [openId, setOpenId] = useAtom(openIdAtom);
  const cur = openId ? s.thinks.find((t) => t.id === openId && TOOLS[t.tool]) : undefined;

  return (
    <div className="stack">
      <ScreenHeader id="think" />
      {cur ? <Editor key={cur.id} t={cur} /> : (
        <>
          <div className="tool-grid">
            {Object.entries(TOOLS).map(([k, t]) => (
              <button key={k} type="button" className="tool" onClick={() => openTool(k)}>
                <strong>{t.name}</strong><span className="muted small">{t.when}</span>
              </button>
            ))}
          </div>
          <Card title="저장된 생각" tag={s.thinks.length ? `${s.thinks.length}개` : null}>
            {s.thinks.length ? (
              <ul className="history">
                {s.thinks.slice(0, 20).map((t) => (
                  <li key={t.id} className="clickable" onClick={() => {
                    if (!TOOLS[t.tool]) return toast('알 수 없는 도구의 기록입니다.');
                    // 가져온 기록은 열 때 한 번 정규화해 둔다 (렌더마다 새 id가 생기지 않도록)
                    store.update((st) => { const x = st.thinks.find((y) => y.id === t.id); if (x) x.data = normalize(x.tool, x.data); });
                    setOpenId(t.id);
                    window.scrollTo(0, 0);
                  }}>
                    <span className="tag">{TOOLS[t.tool]?.name || t.tool || '?'}</span>
                    <span className="grow">{titleOf(t)}</span>
                    <span className="muted small">{timeAgo(t.updatedAt)}</span>
                  </li>
                ))}
              </ul>
            ) : <Empty>도구 하나를 골라 시작하자. 막힌 문제가 있다면 5 Whys가 가장 빠르다.</Empty>}
          </Card>
        </>
      )}
    </div>
  );
}

type Upd = (fn: (d: Record<string, unknown>) => void) => void;

function Editor({ t }: { t: ThinkRec }) {
  const tool = TOOLS[t.tool];
  const data = normalize(t.tool, t.data);
  const upd: Upd = (fn) => store.update((s) => {
    const x = s.thinks.find((y) => y.id === t.id);
    if (!x) return;
    fn(x.data);
    x.updatedAt = Date.now();
  });
  const close = () => leaveThink();
  const remove = () => {
    if (!confirm('이 기록을 지울까요?')) return;
    openIdAtom.set(null);
    store.update((s) => { s.thinks = s.thinks.filter((y) => y.id !== t.id); });
  };
  return (
    <Card title={tool.name} tag="도구" cls="editor">
      <p className="sub">{tool.intro}</p>
      {tool.custom
        ? <DecisionEditor d={data as unknown as Decision} upd={upd} />
        : tool.fields!.map((f) => <FieldEditor key={f.k} f={f} v={data[f.k]} upd={upd} />)}
      <div className="row between">
        <Btn cls="ghost danger sm" onClick={remove}>삭제</Btn>
        <Btn cls="primary" onClick={close}>저장하고 닫기</Btn>
      </div>
    </Card>
  );
}

function FieldEditor({ f, v, upd }: { f: FieldDef; v: unknown; upd: Upd }) {
  const [spark, setSpark] = useState('');
  // 새 줄을 만들면 그 줄로 커서를 옮긴다 (중간에 끼워 넣어도)
  const pending = useRef<number | null>(null);
  const listRef = useRef<HTMLUListElement>(null);
  useLayoutEffect(() => {
    if (pending.current == null) return;
    listRef.current?.querySelectorAll('input')[pending.current]?.focus();
    pending.current = null;
  });

  if (f.type === 'text') {
    return (
      <Field label={f.label} hint={f.hint}>
        <TextArea rows={2} value={v as string} placeholder={f.ph} onChange={(x) => upd((d) => { d[f.k] = x; })} />
      </Field>
    );
  }
  const xs = v as string[];
  if (f.type === 'chain') {
    return (
      <div className="fieldset">
        <span className="label">{f.label}</span>
        <ol className="chain">
          {xs.map((val, i) => (
            <li key={i}><TextArea value={val} placeholder={i === 0 ? '왜 그런 일이 생기나?' : '그건 또 왜?'}
              onChange={(x) => upd((d) => { (d[f.k] as string[])[i] = x; })} /></li>
          ))}
        </ol>
      </div>
    );
  }
  const filled = xs.filter((x) => x.trim()).length;
  return (
    <div className="fieldset">
      <span className="label">{f.label}{filled > 0 && <span className="count"> {filled}</span>}</span>
      <ul className="list-edit" ref={listRef}>
        {xs.map((val, i) => (
          <li key={i}>
            <span className="num">{i + 1}</span>
            <TextInput cls="bare" value={val} placeholder={f.ph}
              onChange={(x) => upd((d) => { (d[f.k] as string[])[i] = x; })}
              onEnter={() => { pending.current = i + 1; upd((d) => { (d[f.k] as string[]).splice(i + 1, 0, ''); }); }} />
            {xs.length > 1 && <IconBtn name="x" label="삭제" onClick={() => upd((d) => { (d[f.k] as string[]).splice(i, 1); })} />}
          </li>
        ))}
      </ul>
      <div className="row">
        <Btn cls="ghost sm" onClick={() => { pending.current = xs.length; upd((d) => { (d[f.k] as string[]).push(''); }); }}>＋ 추가</Btn>
        {f.spark && <Btn cls="ghost sm" onClick={() => setSpark(SPARKS[Math.floor(Math.random() * SPARKS.length)])}>막히면: 자극 질문</Btn>}
      </div>
      {f.spark && <p className="spark-out">{spark}</p>}
      {f.hint && <span className="hint">{f.hint}</span>}
    </div>
  );
}

function DecisionEditor({ d, upd }: { d: Decision; upd: Upd }) {
  const ed = (fn: (x: Decision) => void) => upd((x) => fn(x as unknown as Decision));
  const sk = (o: { id: string }, c: { id: string }) => `${o.id}:${c.id}`;
  const total = (o: { id: string }) => d.criteria.reduce((a, c) => a + (Number(d.scores[sk(o, c)]) || 0) * c.w, 0);
  const max = d.criteria.reduce((a, c) => a + 5 * c.w, 0);
  const totals = d.options.map(total);
  const best = Math.max(...totals);

  return (
    <>
      <Field label="무엇을 결정하나?">
        <TextArea value={d.question} placeholder="예: 이직 제안을 받아들일까?" onChange={(v) => ed((x) => { x.question = v; })} />
      </Field>
      <Field label="되돌릴 수 있는 결정인가?">
        <Chips options={[{ value: true, label: '되돌릴 수 있다' }, { value: false, label: '되돌리기 어렵다' }]} value={d.reversible} onPick={(v) => ed((x) => { x.reversible = v; })} />
      </Field>
      {d.reversible === true && <p className="hint accent">되돌릴 수 있는 결정은 70% 확신이면 충분하다. 오래 고민하는 비용이 더 크다. 빨리 정하고 결과를 보자.</p>}
      {d.reversible === false && <p className="hint">되돌리기 어려운 결정이다. 매트릭스를 채운 뒤 하루 자고 다시 보자. 프리모템도 같이 해 보면 좋다.</p>}
      <div className="matrix-wrap">
        <table className="matrix">
          <thead>
            <tr>
              <th>기준 \ 선택지</th>
              {d.options.map((o, oi) => (
                <th key={o.id}><TextInput cls="bare" value={o.name} placeholder={`선택지 ${oi + 1}`} onChange={(v) => ed((x) => { x.options[oi].name = v; })} /></th>
              ))}
            </tr>
          </thead>
          <tbody>
            {d.criteria.map((c, ci) => (
              <tr key={c.id}>
                <th>
                  <TextInput cls="bare" value={c.name} placeholder={`기준 ${ci + 1}`} onChange={(v) => ed((x) => { x.criteria[ci].name = v; })} />
                  <select className="weight" aria-label="중요도" value={c.w} onChange={(e) => ed((x) => { x.criteria[ci].w = Number(e.target.value); })}>
                    {[1, 2, 3].map((w) => <option key={w} value={w}>×{w}</option>)}
                  </select>
                </th>
                {d.options.map((o) => (
                  <td key={o.id}>
                    <select className="score" aria-label="점수" value={d.scores[sk(o, c)] ?? ''} onChange={(e) => ed((x) => { x.scores[sk(o, c)] = Number(e.target.value) || 0; })}>
                      <option value="">–</option>
                      {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}
                    </select>
                  </td>
                ))}
              </tr>
            ))}
            <tr className="total">
              <th>합계 (최대 {max})</th>
              {d.options.map((o, oi) => <td key={o.id} className={totals[oi] === best && best > 0 ? 'best' : ''}>{totals[oi]}</td>)}
            </tr>
          </tbody>
        </table>
      </div>
      <div className="row">
        {d.options.length < 4 && <Btn cls="ghost sm" onClick={() => ed((x) => { x.options.push({ id: uid(), name: '' }); })}>＋ 선택지</Btn>}
        {d.criteria.length < 6 && <Btn cls="ghost sm" onClick={() => ed((x) => { x.criteria.push({ id: uid(), name: '', w: 2 }); })}>＋ 기준</Btn>}
        {d.options.length > 2 && <Btn cls="ghost sm" onClick={() => ed((x) => { x.options.pop(); })}>선택지 빼기</Btn>}
        {d.criteria.length > 1 && <Btn cls="ghost sm" onClick={() => ed((x) => { x.criteria.pop(); })}>기준 빼기</Btn>}
      </div>
      <p className="hint">점수는 1~5, 기준의 중요도는 ×1~×3. 합계가 마음과 다르게 나온다면, 빠진 기준이 있다는 신호다.</p>
    </>
  );
}
