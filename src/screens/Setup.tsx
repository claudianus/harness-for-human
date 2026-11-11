// 첫 설정: 탭 4번이면 끝. 입력할 칸은 없다. 답을 보고 앱이 시작 루틴을 처방한다.
import { useMemo, useState } from 'react';
import { atom } from '../lib/atom';
import { permission, requestPermission } from '../lib/notify';
import { finishSetup } from '../core/actions';
import { spoken } from '../core/format';
import { iconOf, prescribe, type SetupAnswers } from '../core/templates';
import type { Condition, Struggle } from '../store/model';
import { store, useStore } from '../store/store';

const WAKES = ['06:00', '07:00', '08:00', '09:00', '10:00', '11:00', '12:00'];
const SLEEPS = ['22:00', '23:00', '00:00', '01:00', '02:00', '03:00', '04:00'];
const CONDITIONS: { v: Condition; label: string; sub: string }[] = [
  { v: 0, label: '꽤 괜찮아요', sub: '조금만 다듬으면 돼요' },
  { v: 1, label: '들쭉날쭉해요', sub: '되는 날도 있고 안 되는 날도 있어요' },
  { v: 2, label: '많이 무너졌어요', sub: '하루가 그냥 흘러가요' },
  { v: 3, label: '아무것도 안 돼요', sub: '일어나는 것부터 힘들어요' },
];
const STRUGGLES: { v: Struggle; label: string }[] = [
  { v: 'wake', label: '일어나기' }, { v: 'wash', label: '씻기' }, { v: 'meal', label: '끼니 챙기기' },
  { v: 'outside', label: '밖에 나가기' }, { v: 'chores', label: '집안일' }, { v: 'start', label: '할 일 시작하기' },
  { v: 'promise', label: '약속·마감 지키기' }, { v: 'sleep', label: '잠들기' },
];
// '나' 탭의 "처음부터 다시 설정": 끝내기 전까지는 아무것도 바꾸지 않는다.
export const resetupAtom = atom(false);

const hourLabel = (t: string) => spoken(t).replace('밤 12시', '자정');

export default function Setup({ again = false }: { again?: boolean }) {
  const profile = useStore((s) => s.profile);
  const [step, setStep] = useState(0);
  const [a, setA] = useState<SetupAnswers>(() => ({
    wake: profile.wake, wakeIrregular: profile.wakeIrregular, sleep: profile.sleep, condition: profile.condition, struggles: profile.struggles,
  }));
  const next = (patch: Partial<SetupAnswers>) => { setA((p) => ({ ...p, ...patch })); setStep((n) => n + 1); };
  const askNotify = permission() === 'default';
  const plan = useMemo(() => (step === 5 ? prescribe(a) : []), [a, step]);

  const back = step > 0 && (
    <button type="button" className="link back" onClick={() => setStep((n) => n - 1)}>← 이전</button>
  );
  const dots = step >= 1 && step <= 4 && (
    <div className="steps" aria-label={`질문 ${step} / 4`}>{[1, 2, 3, 4].map((i) => <span key={i} className={i <= step ? 'on' : ''} />)}</div>
  );

  return (
    <div className="setup">
      {dots}
      {step === 0 && (
        <section className="q">
          <h1>{again ? '다시 처음부터 맞춰 볼게요.' : '안녕하세요. 오늘부터 하루 계획은 제가 세울게요.'}</h1>
          <p className="lead">무엇을 언제 할지 고민하지 마세요. 화면에 보이는 것 하나만 하시면 됩니다.</p>
          <p className="muted">먼저 질문 4개만 답해 주세요. 누르기만 하면 됩니다.</p>
          <button type="button" className="btn primary xl" onClick={() => setStep(1)}>좋아요</button>
          {again && <button type="button" className="btn ghost" onClick={() => resetupAtom.set(false)}>그만두고 지금 루틴 유지하기</button>}
        </section>
      )}
      {step === 1 && (
        <section className="q">
          <h1>보통 몇 시쯤 일어나세요?</h1>
          <p className="muted">되고 싶은 시간 말고, 요즘 실제로 일어나는 시간이요.</p>
          <div className="choices grid">
            {WAKES.map((t) => <button key={t} type="button" className={`choice ${a.wake === t && !a.wakeIrregular ? 'on' : ''}`} onClick={() => next({ wake: t, wakeIrregular: false })}>{hourLabel(t)}</button>)}
            <button type="button" className={`choice wide ${a.wakeIrregular ? 'on' : ''}`} onClick={() => next({ wake: '09:00', wakeIrregular: true })}>매일 달라요</button>
          </div>
        </section>
      )}
      {step === 2 && (
        <section className="q">
          <h1>보통 몇 시쯤 잠드세요?</h1>
          <p className="muted">눕는 시간 말고, 실제로 잠드는 시간이요.</p>
          <div className="choices grid">
            {SLEEPS.map((t) => <button key={t} type="button" className={`choice ${a.sleep === t ? 'on' : ''}`} onClick={() => next({ sleep: t })}>{hourLabel(t)}</button>)}
          </div>
          {back}
        </section>
      )}
      {step === 3 && (
        <section className="q">
          <h1>요즘 생활은 어떤가요?</h1>
          <p className="muted">솔직하게 고르셔도 됩니다. 시작하는 크기만 달라져요.</p>
          <div className="choices">
            {CONDITIONS.map((c) => (
              <button key={c.v} type="button" className={`choice tall ${a.condition === c.v ? 'on' : ''}`} onClick={() => next({ condition: c.v })}>
                <strong>{c.label}</strong><span>{c.sub}</span>
              </button>
            ))}
          </div>
          {back}
        </section>
      )}
      {step === 4 && (
        <section className="q">
          <h1>가장 안 되는 걸 골라 주세요.</h1>
          <p className="muted">최대 2개까지요.</p>
          <div className="choices grid">
            {STRUGGLES.map((x) => {
              const on = a.struggles.includes(x.v);
              return (
                <button key={x.v} type="button" className={`choice ${on ? 'on' : ''}`} aria-pressed={on}
                  onClick={() => setA((p) => ({ ...p, struggles: on ? p.struggles.filter((y) => y !== x.v) : [...p.struggles, x.v].slice(-2) }))}>
                  {x.label}
                </button>
              );
            })}
          </div>
          <button type="button" className="btn primary xl" onClick={() => setStep(5)}>{a.struggles.length ? '다음' : '딱히 없어요'}</button>
          {back}
        </section>
      )}
      {step === 5 && (
        <section className="q">
          <h1>처음 2주는 이 3개만 하세요.</h1>
          <p className="lead">나머지는 신경 쓰지 않으셔도 됩니다. 익숙해지면 제가 하나씩 늘려 드릴게요.</p>
          <ol className="plan">
            {plan.map((p) => (
              <li key={p.tpl}>
                <span className="plan-icon" aria-hidden="true">{iconOf(p)}</span>
                <div className="grow">
                  <div className="plan-time">{spoken(p.time)}</div>
                  <strong>{p.target === 'min' ? p.minimum : p.title}</strong>
                  {p.target === 'full' && <div className="muted small">힘든 날엔: {p.minimum}</div>}
                </div>
              </li>
            ))}
          </ol>
          {a.condition === 3 && <p className="muted small">지금은 가장 작은 버전만 목표로 잡았어요. 그것만 해도 충분합니다.</p>}
          {a.wakeIrregular && <p className="muted small">기상 시간이 매일 달라서 오전 9시로 잡았어요. 나중에 ‘나’ 탭에서 바꿀 수 있어요.</p>}
          <p className="muted small">시간이 되면 이 화면에 할 일이 하나씩 나타납니다.{askNotify && ' 시작하면 알림을 허용할지 물어볼게요. 허용해 두시면 기억하지 않으셔도 제가 알려 드려요.'}</p>
          <button type="button" className="btn primary xl"
            onClick={() => {
              const now = Date.now();
              store.update((s) => finishSetup(s, a, now));
              resetupAtom.set(false);
              window.scrollTo(0, 0);
              if (askNotify) void requestPermission();
            }}>
            시작하기
          </button>
          {back}
        </section>
      )}
    </div>
  );
}
