// 메모리 (CLAUDE.md): 경험에서 배운 규칙. 활성 규칙은 집중 세션 시작 때 보인다.
// 몸에 익으면 졸업시켜서 하네스를 줄인다.
import { Btn, Card, Empty, Field, IconBtn, ScreenHeader, TextInput } from '../components/ui';
import { atom, useAtom } from '../lib/atom';
import { fmtDate } from '../lib/time';
import { toast } from '../lib/toast';
import { activeRules, addRule, type Rule } from '../store/model';
import { store, useStore } from '../store/store';

const MAX_ACTIVE = 7;

const LIBRARY: { cat: string; items: [string, string][] }[] = [
  { cat: '집중', items: [
    ['작업을 시작할 때', '완료 기준을 한 문장으로 먼저 쓴다'],
    ['집중 시간에는', '휴대폰을 다른 방에 둔다'],
    ['딴생각이 떠오르면', '캡처에 던지고 바로 돌아온다'],
  ] },
  { cat: '시간', items: [
    ['하루를 계획할 때', '가장 어려운 일을 에너지 피크 시간에 둔다'],
    ['2분 안에 끝날 일이면', '미루지 않고 바로 한다'],
    ['걸리는 시간을 예상할 때', '처음 떠오른 숫자에 1.5를 곱한다'],
  ] },
  { cat: '생각', items: [
    ['결정이 어려울 때', '되돌릴 수 있는 결정인지 먼저 본다. 되돌릴 수 있으면 빨리 정한다'],
    ['15분 넘게 막히면', '누군가에게 묻거나 문제를 더 작게 쪼갠다'],
    ['큰 일을 시작하기 전', '프리모템을 5분 한다'],
  ] },
  { cat: '생활', items: [
    ['잠들기 1시간 전', '화면을 끄고 내일 첫 행동만 적는다'],
    ['오후에 처지면', '커피 대신 10분 걷는다'],
    ['새 습관을 만들 때', '바보 같을 만큼 작게 시작한다'],
  ] },
  { cat: '협업', items: [
    ['요청을 받으면', '완료된 모습과 기한을 되묻는다'],
    ['피드백을 줄 때', '관찰한 사실, 그 영향, 요청 순서로 말한다'],
  ] },
];

const SOURCE: Record<string, string> = { session: '세션 교훈', review: '회고', library: '라이브러리' };
const draftAtom = atom({ trigger: '', text: '' });

export default function Manual() {
  const s = useStore();
  const [draft, setDraft] = useAtom(draftAtom);
  const active = activeRules(s);
  const grads = s.rules.filter((r) => r.status === 'graduated');
  const have = new Set(s.rules.map((r) => r.text));
  const edit = (id: string, fn: (r: Rule) => void) => store.update((st) => { const x = st.rules.find((y) => y.id === id); if (x) fn(x); });

  const add = () => {
    if (!draft.text.trim()) return toast('규칙 내용을 적어 주세요.');
    store.update((st) => addRule(st, draft.text, draft.trigger));
    setDraft({ trigger: '', text: '' });
  };

  return (
    <div className="stack">
      <ScreenHeader id="manual" title="나의 운영 매뉴얼" />
      <Card title="규칙 추가" sub="실수를 한 번 했다면 규칙으로 바꿀 기회다. “언제”를 붙이면 지키기 쉬워진다.">
        <div className="rule-form">
          <Field label="언제"><TextInput value={draft.trigger} placeholder="예: 회의가 끝나면" onChange={(v) => setDraft((d) => ({ ...d, trigger: v }))} onEnter={add} /></Field>
          <Field label="무엇을"><TextInput value={draft.text} placeholder="예: 할 일을 바로 캡처한다" onChange={(v) => setDraft((d) => ({ ...d, text: v }))} onEnter={add} /></Field>
        </div>
        <div className="row end"><Btn cls="primary" onClick={add}>추가</Btn></div>
      </Card>

      <Card title="활성 규칙" tag={`${active.length}/${MAX_ACTIVE}`}>
        {active.length > MAX_ACTIVE && <p className="warn">활성 규칙이 {MAX_ACTIVE}개를 넘었다. 다 지키려 하면 하나도 안 지켜진다. 익숙해진 건 졸업시키고, 안 맞는 건 지우자.</p>}
        {active.length ? (
          <ul className="rule-list">
            {active.map((r) => (
              <li key={r.id} className="rule">
                <div className="grow">
                  {r.trigger && <span className="trigger">{r.trigger}</span>}
                  <span className="rule-text">{r.text}</span>
                  <span className="meta">{fmtDate(r.createdAt)} · {SOURCE[r.source] || '직접 추가'}</span>
                </div>
                <div className="rule-actions">
                  <Btn cls="ghost sm" title="몸에 익었으면 졸업. 집중 화면에서 더 이상 보이지 않는다." onClick={() => {
                    edit(r.id, (x) => { x.status = 'graduated'; x.graduatedAt = Date.now(); });
                    toast('졸업! 이제 의식하지 않아도 되는 규칙입니다.');
                  }}>졸업</Btn>
                  <IconBtn name="x" label="삭제" onClick={() => { if (confirm('이 규칙을 지울까요?')) store.update((st) => { st.rules = st.rules.filter((y) => y.id !== r.id); }); }} />
                </div>
              </li>
            ))}
          </ul>
        ) : <Empty>규칙이 없다. 아래 라이브러리에서 하나만 골라 시작하거나, 집중 세션의 교훈을 기다리자.</Empty>}
      </Card>

      <Card title="규칙 라이브러리" sub="연구와 실천에서 효과가 확인된 것들. 전부 넣지 말고, 지금 나에게 필요한 것 하나만.">
        <details className="library">
          <summary>펼쳐 보기</summary>
          {LIBRARY.map((g) => (
            <div key={g.cat} className="lib-group">
              <div className="mini-label">{g.cat}</div>
              <ul className="rule-list compact">
                {g.items.map(([t, x]) => (
                  <li key={x} className="rule">
                    <div className="grow"><span className="trigger">{t}</span><span className="rule-text">{x}</span></div>
                    {have.has(x) ? <span className="muted small">추가됨</span>
                      : <Btn cls="ghost sm" onClick={() => store.update((st) => addRule(st, x, t, 'library'))}>추가</Btn>}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </details>
      </Card>

      {grads.length > 0 && (
        <Card title="졸업한 규칙" tag={`${grads.length}개`} cls="muted-card">
          <p className="sub">하네스가 줄어든 만큼 내 안에 남은 것들.</p>
          <ul className="rule-list compact">
            {grads.map((r) => (
              <li key={r.id} className="rule">
                <div className="grow">{r.trigger && <span className="trigger">{r.trigger}</span>}<span className="rule-text">{r.text}</span></div>
                <Btn cls="ghost sm" onClick={() => edit(r.id, (x) => { x.status = 'active'; })}>다시 활성화</Btn>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
