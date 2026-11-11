// 에이전트 루프: 계획(목표·완료기준·첫 행동) → 실행(타이머, 잡생각은 캡처로) → 검증 → 다음 단계 메모
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { Btn, Card, Chips, Empty, Field, ScreenHeader, TextArea, TextInput } from '../components/ui';
import { RuleLine } from '../components/RuleLine';
import { atom, useAtom } from '../lib/atom';
import { useNow } from '../lib/hooks';
import { fmtClock, fmtDate, minutesBetween } from '../lib/time';
import { toast } from '../lib/toast';
import { activeRules, addCapture, addRule, openSession, uid, weekStart, type Session, type State, type Verdict } from '../store/model';
import { store, useStore } from '../store/store';

interface Draft { goal: string; criteria: string; firstAction: string; plannedMin: number | null }
const emptyDraft = (): Draft => ({ goal: '', criteria: '', firstAction: '', plannedMin: null });

// 화면을 오가도 유지되는 초안. 오늘 화면의 "어제 정한 첫 행동"도 여기로 채운다.
export const focusDraft = atom<Draft>(emptyDraft());
const lessonAtom = atom('');

export function prefillFocus(d: Partial<Draft>) {
  focusDraft.set((x) => ({ ...x, ...d }));
}

export default function Focus() {
  const s = useStore();
  const cur = openSession(s);
  return (
    <div className="stack">
      <ScreenHeader id="focus" />
      {!cur ? <PlanView s={s} /> : cur.status === 'active' ? <RunView s={s} cur={cur} /> : <VerifyView s={s} cur={cur} />}
      <History s={s} />
    </div>
  );
}

function RulesCard({ s }: { s: State }) {
  const navigate = useNavigate();
  const rules = activeRules(s);
  if (!rules.length) {
    return (
      <Card title="시작 전 매뉴얼" tag="메모리">
        <p className="muted">아직 규칙이 없습니다. 세션이 끝날 때 교훈을 남기면 여기에 나타납니다.</p>
        <Btn cls="ghost sm" onClick={() => navigate('/manual')}>매뉴얼 열기</Btn>
      </Card>
    );
  }
  return (
    <Card title="시작 전 매뉴얼" tag={`규칙 ${rules.length}개`} cls="rules-card">
      <ul className="rule-list compact">{rules.slice(0, 5).map((r) => <RuleLine key={r.id} r={r} />)}</ul>
      {rules.length > 5 && <p className="hint">외 {rules.length - 5}개 — 매뉴얼에서 확인</p>}
    </Card>
  );
}

function PlanView({ s }: { s: State }) {
  const [draft, setDraft] = useAtom(focusDraft);
  const planned = draft.plannedMin ?? s.settings.focusMin;
  const set = (k: keyof Draft) => (v: string) => setDraft((d) => ({ ...d, [k]: v }));
  const last = s.sessions.find((x) => x.status === 'done' && x.nextStep);

  const start = () => {
    const d = focusDraft.get(); // 렌더 시점이 아니라 누른 시점의 초안
    if (!d.goal.trim()) return toast('목표를 먼저 적어 주세요.');
    if (!d.criteria.trim()) return toast('완료 기준을 먼저. 기준 없는 작업은 끝나지 않습니다.');
    store.update((st) => {
      st.sessions.unshift({
        id: uid(), goal: d.goal.trim(), criteria: d.criteria.trim(), firstAction: d.firstAction.trim(),
        plannedMin: d.plannedMin ?? st.settings.focusMin, startAt: Date.now(), endAt: 0, status: 'active',
      });
    });
    setDraft(emptyDraft());
    window.scrollTo(0, 0);
  };

  return (
    <>
      <RulesCard s={s} />
      {last && draft.firstAction !== last.nextStep && (
        <Card title="지난 세션에서 남긴 메모" tag="이어하기" cls="accent-soft">
          <p><span className="muted">{last.goal} → </span><strong>{last.nextStep}</strong></p>
          <Btn cls="ghost sm" onClick={() => prefillFocus({ goal: last.verdict === 'met' ? '' : last.goal, firstAction: last.nextStep })}>이어서 계획하기</Btn>
        </Card>
      )}
      <Card title="세션 계획" sub="시작 전 30초. 이 세 줄이 프롬프트다.">
        <Field label="목표"><TextArea value={draft.goal} placeholder="예: 랜딩 페이지 카피 초안 쓰기" onChange={set('goal')} /></Field>
        <Field label="완료 기준" hint="끝났는지 누가 봐도 판단할 수 있게. 기준이 없으면 작업은 끝나지 않는다.">
          <TextArea value={draft.criteria} placeholder="예: 헤드라인 3안 + 본문 1개가 문서에 있다" onChange={set('criteria')} />
        </Field>
        <Field label="첫 행동" hint="2분 안에 손이 움직일 수 있는 물리적인 행동.">
          <TextArea value={draft.firstAction} placeholder="예: 경쟁사 랜딩 2개 열기" onChange={set('firstAction')} />
        </Field>
        <Field label="시간">
          <Chips options={[15, 25, 50, 90].map((m) => ({ value: m, label: `${m}분` }))} value={planned} onPick={(m) => setDraft((d) => ({ ...d, plannedMin: m }))} />
        </Field>
        <div className="row end"><Btn cls="primary lg" onClick={start}>세션 시작</Btn></div>
      </Card>
    </>
  );
}

function RunView({ s, cur }: { s: State; cur: Session }) {
  const now = useNow();
  const [cap, setCap] = useState('');
  const total = cur.plannedMin * 60000;
  const left = cur.startAt + total - now;
  const caps = s.captures.filter((c) => c.sessionId === cur.id);
  const edit = (fn: (x: Session) => void) => store.update((st) => { const x = st.sessions.find((y) => y.id === cur.id); if (x) fn(x); });

  return (
    <>
      <Card cls="run">
        <div className="run-top"><span className="tag live">진행 중</span><span className="muted small">{cur.plannedMin}분 계획</span></div>
        <div className={`clock ${left < 0 ? 'over' : ''}`} aria-live="off">{fmtClock(left)}</div>
        <div className="bar"><div className="bar-fill" style={{ width: `${Math.min(100, ((total - left) / total) * 100)}%` }} /></div>
        <dl className="brief">
          <dt>목표</dt><dd>{cur.goal}</dd>
          <dt>완료 기준</dt><dd>{cur.criteria}</dd>
          {cur.firstAction && <><dt>첫 행동</dt><dd>{cur.firstAction}</dd></>}
        </dl>
        <div className="row">
          <Btn cls="primary" onClick={() => edit((x) => { x.status = 'reviewing'; x.endAt = Date.now(); })}>끝내고 검증하기</Btn>
          <Btn cls="ghost" onClick={() => edit((x) => { x.plannedMin += 5; })}>+5분</Btn>
          <Btn cls="ghost danger" onClick={() => {
            if (confirm('이 세션을 기록 없이 취소할까요?')) store.update((st) => { st.sessions = st.sessions.filter((y) => y.id !== cur.id); });
          }}>취소</Btn>
        </div>
      </Card>
      <Card title="컨텍스트 비우기" sub="작업과 상관없는 생각은 여기에. 붙잡고 있으면 작업기억을 차지한다." tag="캡처">
        <TextInput value={cap} onChange={setCap} placeholder="떠오른 생각, 할 일 → Enter로 던지고 계속" onEnter={(v) => {
          if (!v.trim()) return;
          store.update((st) => addCapture(st, v, cur.id));
          setCap('');
        }} />
        <ul className="cap-list">{caps.map((c) => <li key={c.id}>{c.text}</li>)}</ul>
      </Card>
    </>
  );
}

const VERDICTS: { value: Verdict; label: string; cls: string }[] = [
  { value: 'met', label: '충족', cls: 'good' },
  { value: 'partial', label: '일부', cls: 'mid' },
  { value: 'missed', label: '미충족', cls: 'bad' },
];

function VerifyView({ s, cur }: { s: State; cur: Session }) {
  const [lesson, setLesson] = useAtom(lessonAtom);
  const edit = (fn: (x: Session) => void) => store.update((st) => { const x = st.sessions.find((y) => y.id === cur.id); if (x) fn(x); });
  const mins = minutesBetween(cur.startAt, cur.endAt);
  const caps = s.captures.filter((c) => c.sessionId === cur.id && c.status === 'inbox').length;
  const met = cur.verdict === 'met';

  const finish = () => {
    if (!cur.verdict) return toast('기준 충족 여부를 골라 주세요.');
    const l = lesson.trim();
    store.update((st) => {
      const x = st.sessions.find((y) => y.id === cur.id);
      if (x) x.status = 'done';
      if (l) addRule(st, l, '', 'session');
    });
    setLesson('');
    window.scrollTo(0, 0);
    toast(l ? '기록 완료. 교훈이 매뉴얼에 추가됐습니다.' : '기록 완료.');
  };

  return (
    <Card title="검증" tag={`${mins}분 작업`} cls="verify">
      <p className="muted small">시작할 때 정한 기준</p>
      <blockquote>{cur.criteria}</blockquote>
      <Field label="기준을 충족했나?"><Chips options={VERDICTS} value={cur.verdict} onPick={(v) => edit((x) => { x.verdict = v; })} /></Field>
      <Field label={met ? '무엇이 잘 작동했나?' : '무엇이 막았나?'}>
        <TextArea value={cur.reflection ?? ''} placeholder={met ? '예: 첫 행동을 아주 작게 잡았다' : '예: 자료가 흩어져 있어서 찾느라 20분'} onChange={(v) => edit((x) => { x.reflection = v; })} />
      </Field>
      <Field label="다음 단계 메모" hint="다음 세션을 열면 이 메모가 맨 위에 뜬다.">
        <TextArea value={cur.nextStep ?? ''} placeholder="다음에 이어서 할 첫 행동. 미래의 나에게 남기는 메모." onChange={(v) => edit((x) => { x.nextStep = v; })} />
      </Field>
      <Field label="규칙으로 남길 교훈 (선택)" hint="적으면 매뉴얼에 규칙으로 추가된다.">
        <TextArea value={lesson} placeholder="예: 자료 수집은 세션 전에 따로 한다" onChange={setLesson} />
      </Field>
      {caps > 0 && <p className="hint">이번 세션에서 캡처한 {caps}개가 캡처함에서 기다리고 있다.</p>}
      <div className="row end"><Btn cls="primary lg" onClick={finish}>기록하고 마치기</Btn></div>
    </Card>
  );
}

const LABEL: Record<Verdict, string> = { met: '충족', partial: '일부', missed: '미충족' };

function History({ s }: { s: State }) {
  const done = s.sessions.filter((x) => x.status === 'done');
  const ws = weekStart().getTime();
  const week = done.filter((x) => x.startAt >= ws);
  const met = week.filter((x) => x.verdict === 'met').length;
  const mins = week.reduce((a, x) => a + minutesBetween(x.startAt, x.endAt), 0);
  return (
    <Card title="기록" tag={week.length ? `이번 주 ${week.length}회 · ${mins}분 · 충족 ${Math.round((met / week.length) * 100)}%` : null}>
      {done.length ? (
        <ul className="history">
          {done.slice(0, 8).map((x) => (
            <li key={x.id}>
              <span className={`dot ${x.verdict ?? ''}`} title={x.verdict ? LABEL[x.verdict] : ''} />
              <span className="grow">{x.goal}</span>
              <span className="muted small">{fmtDate(x.startAt)} · {minutesBetween(x.startAt, x.endAt)}분</span>
            </li>
          ))}
        </ul>
      ) : <Empty>첫 세션을 시작해 보세요. 기록이 쌓이면 회고에서 패턴이 보입니다.</Empty>}
    </Card>
  );
}
