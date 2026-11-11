// 시스템 프롬프트: 오늘의 한 문장, 가장 중요한 3가지, if-then 계획, 하루 종료 의식
import { useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { Btn, Card, Field, Icon, IconBtn, TextArea, TextInput } from '../components/ui';
import { RuleLine } from '../components/RuleLine';
import { useDayKey } from '../lib/hooks';
import { toast } from '../lib/toast';
import { activeRules, dayKey, getDay, keyToDate, lastDayKeys, openSession, peekDay, uid, type Day, type State } from '../store/model';
import { store, useStore } from '../store/store';
import { prefillFocus } from './Focus';

const WEEKDAY = ['일', '월', '화', '수', '목', '금', '토'];

export default function Today() {
  const s = useStore();
  const key = useDayKey();
  const day = peekDay(s, key);
  const date = keyToDate(key);
  const editDay = (fn: (d: Day) => void) => store.update((st) => fn(getDay(st, key)));

  return (
    <div className="stack">
      <header className="screen-head">
        <div className="layer">시스템 프롬프트</div>
        <h1>{date.getMonth() + 1}월 {date.getDate()}일 {WEEKDAY[date.getDay()]}요일</h1>
        <p className="muted">목표와 제약을 먼저 정하면 나머지 하루가 그 위에서 돈다.</p>
      </header>
      {!s.settings.onboarded && <Onboarding />}
      <Signals s={s} dayKeyStr={key} />
      <Card title="오늘의 한 문장" sub="오늘이 끝났을 때 무엇이 되어 있으면 좋은 하루인가?">
        <TextArea cls="big" value={day.intention} placeholder="예: 기획서 초안을 팀에 보낸다" onChange={(v) => editDay((d) => { d.intention = v; })} />
      </Card>
      <Top3 day={day} editDay={editDay} />
      <IfThenCard day={day} editDay={editDay} />
      <Shutdown s={s} day={day} editDay={editDay} />
    </div>
  );
}

function Onboarding() {
  return (
    <Card title="사람에게 씌우는 하네스" cls="onboard">
      <p>같은 AI 모델도 지시, 도구, 메모리, 검증 루프를 어떻게 짜느냐에 따라 성능이 크게 달라진다. 이 앱은 그 구조를 사람에게 옮긴 것이다. 화면 하나가 하네스의 층 하나다.</p>
      <ol className="principles">
        <li><strong>최소한으로. </strong>실수가 실제로 나는 곳만 다룬다.</li>
        <li><strong>스스로 고른다. </strong>안 쓰는 모듈은 설정에서 끈다.</li>
        <li><strong>피드백은 빠르게. </strong>세션마다 기준 대비 결과를 확인한다.</li>
        <li><strong>점점 줄인다. </strong>몸에 익은 규칙과 습관은 졸업시킨다.</li>
      </ol>
      <p className="muted small">시작은 간단하다. 아래에 오늘의 한 문장을 쓰고, 집중 탭에서 세션 하나를 돌려 보자. 어디서든 ＋ 버튼(또는 ⌘K)으로 생각을 캡처할 수 있다.</p>
      <Btn cls="primary sm" onClick={() => store.update((st) => { st.settings.onboarded = true; })}>알겠어요</Btn>
    </Card>
  );
}

// 최근 3일 안에 남긴 "내일의 첫 행동"만. 더 오래된 메모는 이미 의미가 없다.
export function prevTomorrow(s: State, key: string): { text: string; label: string } | null {
  const end = keyToDate(key);
  end.setDate(end.getDate() - 1);
  const k = lastDayKeys(3, end).reverse().find((x) => s.days[x]?.shutdown?.tomorrow?.trim());
  if (!k) return null;
  const d = keyToDate(k);
  return { text: s.days[k].shutdown.tomorrow, label: k === dayKey(end) ? '어제 정한 첫 행동' : `${d.getMonth() + 1}/${d.getDate()}에 정한 첫 행동` };
}

function Signal({ icon, children, onClick, cls = '' }: { icon: string; children: ReactNode; onClick: () => void; cls?: string }) {
  return (
    <button type="button" className={`signal ${cls}`} onClick={onClick}>
      <Icon name={icon} size={18} /><span className="grow">{children}</span><Icon name="arrow" size={16} />
    </button>
  );
}

function Signals({ s, dayKeyStr: key }: { s: State; dayKeyStr: string }) {
  const navigate = useNavigate();
  const rows: ReactNode[] = [];
  const sess = openSession(s);
  if (sess) rows.push(<Signal key="sess" icon="focus" cls="live" onClick={() => navigate('/focus')}>{sess.status === 'active' ? `집중 중: ${sess.goal}` : `검증 대기: ${sess.goal}`}</Signal>);

  const tmr = prevTomorrow(s, key);
  const day = peekDay(s, key);
  // 오늘 세션을 이미 시작했다면 첫 행동은 끝난 것으로 본다.
  const startedToday = s.sessions.some((x) => dayKey(new Date(x.startAt)) === key);
  if (tmr && !sess && !startedToday && !day.shutdown.done) {
    rows.push(<Signal key="tmr" icon="arrow" onClick={() => { prefillFocus({ firstAction: tmr.text }); navigate('/focus'); }}>
      <span className="muted">{tmr.label} · </span>{tmr.text}
    </Signal>);
  }
  const inbox = s.captures.filter((c) => c.status === 'inbox').length;
  if (inbox && s.settings.modules.inbox) rows.push(<Signal key="inbox" icon="inbox" onClick={() => navigate('/inbox')}>정리 안 된 캡처 {inbox}개</Signal>);
  if (!s.logs.some((l) => l.day === key) && s.settings.modules.rhythm) rows.push(<Signal key="rhythm" icon="rhythm" onClick={() => navigate('/rhythm')}>오늘 컨디션 체크 아직</Signal>);

  const rules = s.settings.modules.manual ? activeRules(s) : [];
  if (!rows.length && !rules.length) return null;
  return (
    <Card cls="signals">
      {rows.length > 0 && <div className="sig-list">{rows}</div>}
      {rules.length > 0 && (
        <div className="today-rules">
          <div className="mini-label">오늘의 매뉴얼</div>
          <ul className="rule-list compact">{rules.slice(0, 3).map((r) => <RuleLine key={r.id} r={r} />)}</ul>
        </div>
      )}
    </Card>
  );
}

type EditDay = (fn: (d: Day) => void) => void;

function Top3({ day, editDay }: { day: Day; editDay: EditDay }) {
  const [add, setAdd] = useState('');
  const edit = (id: string, fn: (it: Day['top3'][number]) => void) => editDay((d) => { const it = d.top3.find((x) => x.id === id); if (it) fn(it); });
  const doneN = day.top3.filter((x) => x.done).length;
  return (
    <Card title="가장 중요한 3가지" tag={day.top3.length ? `${doneN}/${day.top3.length}` : null} sub="3개를 넘기지 않는다. 이것만 하면 성공인 하루.">
      <ul className="checklist">
        {day.top3.map((item) => (
          <li key={item.id} className={item.done ? 'done' : ''}>
            <input type="checkbox" checked={item.done} aria-label="완료" onChange={(e) => edit(item.id, (it) => { it.done = e.target.checked; })} />
            <TextInput cls="bare" label="할 일" value={item.text} onChange={(v) => edit(item.id, (it) => { it.text = v; })} />
            <IconBtn name="x" label="삭제" onClick={() => editDay((d) => { d.top3 = d.top3.filter((x) => x.id !== item.id); })} />
          </li>
        ))}
        {day.top3.length < 3 && (
          <li className="add">
            <Icon name="plus" size={18} />
            <TextInput cls="bare" value={add} onChange={setAdd}
              placeholder={day.top3.length ? '추가 후 Enter' : '가장 중요한 일부터. 추가 후 Enter'}
              onEnter={(v) => {
                if (!v.trim()) return;
                editDay((d) => { d.top3.push({ id: uid(), text: v.trim(), done: false }); });
                setAdd('');
              }} />
          </li>
        )}
      </ul>
      {day.top3.length >= 3 && <p className="hint">꽉 찼다. 더 넣고 싶다면 무엇을 뺄지 먼저 정하자.</p>}
    </Card>
  );
}

function IfThenCard({ day, editDay }: { day: Day; editDay: EditDay }) {
  const edit = (id: string, k: 'if' | 'then', v: string) => editDay((d) => { const it = d.ifThen.find((x) => x.id === id); if (it) it[k] = v; });
  return (
    <Card title="If-then 계획" sub="“만약 X이면 Y한다”로 미리 정해 두면, 그 순간에 의지력을 쓰지 않아도 된다.">
      {day.ifThen.length > 0 && (
        <div className="ifthen-list">
          {day.ifThen.map((it) => (
            <div key={it.id} className="ifthen">
              <span className="kw">만약</span>
              <TextInput cls="bare" label="상황" value={it.if} placeholder="오후 3시에 졸리면" onChange={(v) => edit(it.id, 'if', v)} />
              <span className="kw">→</span>
              <TextInput cls="bare" label="행동" value={it.then} placeholder="10분 걷는다" onChange={(v) => edit(it.id, 'then', v)} />
              <IconBtn name="x" label="삭제" onClick={() => editDay((d) => { d.ifThen = d.ifThen.filter((x) => x.id !== it.id); })} />
            </div>
          ))}
        </div>
      )}
      {day.ifThen.length < 3 && <Btn cls="ghost sm" onClick={() => editDay((d) => { d.ifThen.push({ id: uid(), if: '', then: '' }); })}>＋ 계획 추가</Btn>}
    </Card>
  );
}

function Shutdown({ s, day, editDay }: { s: State; day: Day; editDay: EditDay }) {
  const navigate = useNavigate();
  const sd = day.shutdown;
  if (sd.done) {
    return (
      <Card title="하루 종료" tag="완료" cls="muted-card">
        {sd.win && <p><span className="muted">잘된 것 · </span>{sd.win}</p>}
        {sd.tomorrow && <p><span className="muted">내일 첫 행동 · </span>{sd.tomorrow}</p>}
        <Btn cls="ghost sm" onClick={() => editDay((d) => { d.shutdown.done = false; })}>다시 열기</Btn>
      </Card>
    );
  }
  const inbox = s.captures.filter((c) => c.status === 'inbox').length;
  const doneN = day.top3.filter((x) => x.done).length;
  return (
    <Card title="하루 종료 의식" sub="일을 머릿속에서 내려놓는 절차. 끝을 정하지 않으면 뇌는 퇴근하지 않는다.">
      <ul className="auto-checks">
        <li className={inbox === 0 ? 'ok' : ''}>
          <Icon name={inbox === 0 ? 'check' : 'inbox'} size={16} />
          {inbox === 0 ? '캡처함 비움' : <button type="button" className="link" onClick={() => navigate('/inbox')}>캡처 {inbox}개 정리하기</button>}
        </li>
        <li className={day.top3.length && doneN === day.top3.length ? 'ok' : ''}><Icon name="check" size={16} />중요한 3가지 {doneN}/{day.top3.length}</li>
      </ul>
      <Field label="오늘 잘된 것 하나"><TextArea value={sd.win} placeholder="작아도 된다" onChange={(v) => editDay((d) => { d.shutdown.win = v; })} /></Field>
      <Field label="내일의 첫 행동" hint="내일 이 화면 맨 위에 뜬다.">
        <TextArea value={sd.tomorrow} placeholder="내일 아침, 생각 없이 바로 할 수 있게" onChange={(v) => editDay((d) => { d.shutdown.tomorrow = v; })} />
      </Field>
      <div className="row end"><Btn cls="primary" onClick={() => { editDay((d) => { d.shutdown.done = true; }); toast('수고했어요. 오늘은 여기까지.'); }}>오늘 종료</Btn></div>
    </Card>
  );
}
