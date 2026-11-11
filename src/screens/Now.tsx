// "지금" 화면: 지금 할 것 하나만 보여 준다. 무엇을 보여 줄지는 엔진(selectNow)이 정한다.
import { useState } from 'react';
import { atom, useAtom } from '../lib/atom';
import { bringForward, closeDay, record, requestWrap, snooze } from '../core/actions';
import { dayProgress, dayStartMin, logicalKey, needsReason, selectNow, tomorrowFirst, type NowView } from '../core/engine';
import { REASONS, STATE_LABEL, dateLabel, hm, josa, spoken, spokenTs, until } from '../core/format';
import { iconOf } from '../core/templates';
import { useNow } from '../lib/hooks';
import { fmtClock } from '../lib/time';
import { toast } from '../lib/toast';
import { peekDay, type Anchor, type OutcomeStatus, type Reason, type State } from '../store/model';
import { store, useStore } from '../store/store';
import Setup, { resetupAtom } from './Setup';

const act = (fn: (s: State, now: number) => void) => {
  const t = Date.now();
  store.update((s) => fn(s, t));
};

const DONE_MSG: Record<OutcomeStatus, string> = {
  done: '좋아요. 하나 끝났어요.',
  min: '최소 버전도 해낸 거예요. 잘하셨어요.',
  skip: '괜찮아요. 밤에 이유만 한 번 여쭤볼게요.',
  missed: '괜찮아요. 다음 것만 하시면 됩니다.',
};
// 2분 모드는 화면 상태와 따로 둔다: 하는 도중에 창이 닫혀도("했나요?"로 바뀌어도) 타이머를 유지한다.
const twoAtom = atom<{ id: string; key: string; at: number } | null>(null);

function mark(key: string, a: Anchor, status: OutcomeStatus, late = false) {
  twoAtom.set(null);
  act((s, t) => record(s, key, a.id, status, t, late));
  toast(DONE_MSG[status]);
}

export default function Now() {
  const s = useStore();
  const now = useNow();
  const [two] = useAtom(twoAtom);
  const [resetup] = useAtom(resetupAtom);
  const view = selectNow(s, now);
  if (view.kind === 'setup' || resetup) return <Setup again={resetup} />;
  const key = logicalKey(now, dayStartMin(s.profile));
  const twoAnchor = two && !peekDay(s, two.key).outcomes[two.id] ? s.anchors.find((a) => a.id === two.id) : undefined;
  return (
    <div className="now">
      <p className="now-date">{dateLabel(key)} · {hm(now)}</p>
      {two && twoAnchor
        ? <TwoMinutes a={twoAnchor} dayKey={two.key} startedAt={two.at} now={now} />
        : <ViewCard key={cardKey(view)} view={view} s={s} now={now} />}
      <Dots s={s} dayKey={key} now={now} />
    </div>
  );
}

const cardKey = (v: NowView) => ('anchor' in v ? `${v.kind}:${v.anchor.id}` : v.kind);

function ViewCard({ view, s, now }: { view: Exclude<NowView, { kind: 'setup' }>; s: State; now: number }) {
  switch (view.kind) {
    case 'due': return <Due a={view.anchor} dayKey={view.key} late={view.late} snoozed={peekDay(s, view.key).snoozeCount[view.anchor.id] || 0} />;
    case 'catchup': return <Catchup a={view.anchor} dayKey={view.key} />;
    case 'yesterday': return <Yesterday a={view.anchor} dayKey={view.key} />;
    case 'wrapup': return <Wrapup s={s} dayKey={view.key} now={now} />;
    case 'idle': return <Idle s={s} view={view} now={now} />;
  }
}

const main = (a: Anchor) => (a.target === 'min' ? a.minimum : a.title);

function TwoMinutes({ a, dayKey, startedAt, now }: { a: Anchor; dayKey: string; startedAt: number; now: number }) {
  const left = 120_000 - (now - startedAt);
  return (
    <section className="now-card two">
      <p className="now-kicker">2분만</p>
      <div className={`clock ${left <= 0 ? 'over' : ''}`}>{left > 0 ? fmtClock(left) : '2분 끝'}</div>
      <h1 className="now-title">{a.minimum}</h1>
      <p className="lead">{left > 0 ? '이것만 하세요. 2분 뒤에 그만둬도 성공입니다.' : '2분 지났어요. 여기서 멈춰도 됩니다. 더 하고 싶으면 계속하세요.'}</p>
      <div className="now-actions">
        <button type="button" className="btn primary xl" onClick={() => mark(dayKey, a, 'min')}>최소만 했어요</button>
        {a.target === 'full' && <button type="button" className="btn xl" onClick={() => mark(dayKey, a, 'done')}>끝까지 했어요</button>}
        <button type="button" className="btn ghost" onClick={() => twoAtom.set(null)}>그만할래요</button>
      </div>
    </section>
  );
}

function Due({ a, dayKey, late, snoozed }: { a: Anchor; dayKey: string; late: boolean; snoozed: number }) {
  const [mode, setMode] = useState<'card' | 'later'>('card');

  const later = (ms: number) => {
    act((s, t) => snooze(s, dayKey, a.id, t + ms));
    toast(`${until(ms)}에 다시 알려 드릴게요.`);
  };

  return (
    <section className="now-card">
      <p className="now-kicker">{late ? `늦었지만 지금이라도 · ${spoken(a.time)}` : `지금 할 것 · ${spoken(a.time)}`}</p>
      <div className="now-icon" aria-hidden="true">{iconOf(a)}</div>
      <h1 className="now-title">{main(a)}</h1>
      {a.target === 'full' && <p className="now-min">힘들면 <strong>{a.minimum}</strong>만 해도 됩니다.</p>}
      {snoozed >= 2 && mode === 'card' && <p className="nudge">벌써 {snoozed}번 미뤘어요. 이번엔 2분만 해 볼까요?</p>}
      {mode === 'card' ? (
        <div className="now-actions">
          <button type="button" className="btn primary xl" onClick={() => mark(dayKey, a, a.target === 'min' ? 'min' : 'done')}>했어요</button>
          <button type="button" className={`btn xl ${snoozed >= 2 ? 'primary-soft' : ''}`} onClick={() => twoAtom.set({ id: a.id, key: dayKey, at: Date.now() })}>2분만 해볼게요</button>
          <button type="button" className="btn ghost" onClick={() => setMode('later')}>나중에</button>
          {a.target === 'min' && <button type="button" className="link small" onClick={() => mark(dayKey, a, 'done')}>원래 버전({a.title})까지 했어요</button>}
        </div>
      ) : (
        <div className="now-actions">
          <p className="muted">언제 다시 알려 드릴까요?</p>
          <button type="button" className="btn xl" onClick={() => later(20 * 60_000)}>20분 뒤</button>
          <button type="button" className="btn xl" onClick={() => later(60 * 60_000)}>1시간 뒤</button>
          <button type="button" className="btn ghost danger" onClick={() => mark(dayKey, a, 'skip')}>오늘은 안 할래요</button>
          <button type="button" className="btn ghost" onClick={() => setMode('card')}>돌아가기</button>
        </div>
      )}
    </section>
  );
}

function Catchup({ a, dayKey }: { a: Anchor; dayKey: string }) {
  return (
    <section className="now-card ask">
      <p className="now-kicker">확인할게요</p>
      <div className="now-icon" aria-hidden="true">{iconOf(a)}</div>
      <h1 className="now-title">{spoken(a.time)}에 {josa(main(a), '을를')} 하기로 했었어요. 했나요?</h1>
      <div className="now-actions">
        <button type="button" className="btn primary xl" onClick={() => mark(dayKey, a, a.target === 'min' ? 'min' : 'done')}>했어요</button>
        <button type="button" className="btn xl" onClick={() => act((s, t) => bringForward(s, dayKey, a.id, t))}>지금 할게요</button>
        <button type="button" className="btn ghost" onClick={() => mark(dayKey, a, 'missed')}>못 했어요</button>
      </div>
    </section>
  );
}

function Yesterday({ a, dayKey }: { a: Anchor; dayKey: string }) {
  return (
    <section className="now-card ask">
      <p className="now-kicker">어제 일 하나만 확인할게요</p>
      <div className="now-icon" aria-hidden="true">{iconOf(a)}</div>
      <h1 className="now-title">어제 {spoken(a.time)}, {josa(a.title, '은는')} 했나요?</h1>
      <div className="now-actions">
        <button type="button" className="btn primary xl" onClick={() => mark(dayKey, a, 'done', true)}>했어요</button>
        <button type="button" className="btn xl" onClick={() => mark(dayKey, a, 'min', true)}>최소만 했어요 ({a.minimum})</button>
        <button type="button" className="btn ghost" onClick={() => mark(dayKey, a, 'missed', true)}>못 했어요</button>
      </div>
    </section>
  );
}

function Wrapup({ s, dayKey, now }: { s: State; dayKey: string; now: number }) {
  const [reasons, setReasons] = useState<Record<string, Reason>>({});
  const prog = dayProgress(s, dayKey, now).filter((p) => p.state !== 'na');
  const did = prog.filter((p) => p.state === 'done' || p.state === 'min').length;
  const pending = needsReason(s, dayKey, now);
  const left = prog.filter((p) => p.state === 'due' || p.state === 'upcoming' || p.state === 'snoozed');
  const first = tomorrowFirst(s, dayKey);
  const early = peekDay(s, dayKey).wrapRequested;

  const summary = prog.length === 0 ? '오늘은 정해 둔 게 없었어요.'
    : did === prog.length ? '오늘 할 건 전부 했어요. 정말 잘하셨어요.'
    : did > 0 ? `${prog.length}개 중 ${did}개 했어요. 하나라도 했으면 오늘은 이긴 거예요.`
    : '오늘은 하나도 못 했어요. 괜찮아요. 그래서 제가 있는 거예요.';

  return (
    <section className="now-card wrap">
      <p className="now-kicker">하루 마감</p>
      <h1 className="now-title">오늘 하루, 여기서 정리할게요.</h1>
      <p className="lead">{summary}</p>

      {pending.length > 0 && (
        <div className="reasons">
          <p className="muted small">못 한 건 왜 그랬는지만 골라 주세요. 탓하려는 게 아니라, 내일 계획을 고치는 데 씁니다.</p>
          {pending.map((a) => (
            <div key={a.id} className="reason">
              <strong>{iconOf(a)} {main(a)}</strong>
              <div className="chips">
                {REASONS.map((r) => (
                  <button key={r.v} type="button" className={`chip ${reasons[a.id] === r.v ? 'on' : ''}`} aria-pressed={reasons[a.id] === r.v}
                    onClick={() => setReasons((p) => ({ ...p, [a.id]: r.v }))}>{r.label}</button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {left.length > 0 && (
        <p className="muted small">마감해도 {josa(left.map((p) => `${spokenTs(p.at)} ${main(p.anchor)}`).join(', '), '은는')} 그때 알려 드릴게요.</p>
      )}
      {first && (
        <div className="tomorrow">
          <span className="muted small">내일 첫 할 일</span>
          <strong>{iconOf(first)} {spoken(first.time)} · {main(first)}</strong>
        </div>
      )}
      <div className="now-actions">
        <button type="button" className="btn primary xl" onClick={() => { act((st, t) => closeDay(st, dayKey, t, reasons)); toast('오늘 하루 수고하셨어요.'); }}>하루 마감하기</button>
        {early && <button type="button" className="btn ghost" onClick={() => act((st) => requestWrap(st, dayKey, false))}>아직 아니에요</button>}
      </div>
    </section>
  );
}

function Idle({ s, view, now }: { s: State; view: Extract<NowView, { kind: 'idle' }>; now: number }) {
  const { next, closed, key } = view;
  const first = tomorrowFirst(s, key);
  if (next) {
    return (
      <section className="now-card idle">
        <p className="now-kicker">{closed ? '오늘은 마감했어요' : '지금은 쉬셔도 돼요'}</p>
        <p className="lead">다음 할 일은</p>
        <div className="now-icon" aria-hidden="true">{iconOf(next.anchor)}</div>
        <h1 className="now-title">{main(next.anchor)}</h1>
        <p className="now-min">{spokenTs(next.at)} · {until(next.at - now)}</p>
        <p className="muted small">그때 이 화면에 나타나요. 그 전까지는 하고 싶은 걸 하세요.</p>
        <div className="now-actions">
          <button type="button" className="btn xl" onClick={() => act((st, t) => bringForward(st, key, next.anchor.id, t))}>미리 할래요</button>
          {!closed && <button type="button" className="btn ghost" onClick={() => act((st) => requestWrap(st, key, true))}>오늘은 여기까지 (마감하기)</button>}
        </div>
      </section>
    );
  }
  return (
    <section className="now-card idle">
      <p className="now-kicker">{closed ? '오늘은 마감했어요' : '오늘 할 건 끝났어요'}</p>
      <h1 className="now-title">{closed ? '푹 쉬세요.' : '남은 건 하루 마감뿐이에요.'}</h1>
      {first && <p className="now-min">내일 {spoken(first.time)}에 {main(first)}부터 시작해요.</p>}
      {!closed && (
        <div className="now-actions">
          <button type="button" className="btn primary xl" onClick={() => act((st) => requestWrap(st, key, true))}>지금 마감하기</button>
        </div>
      )}
    </section>
  );
}

function Dots({ s, dayKey, now }: { s: State; dayKey: string; now: number }) {
  const prog = dayProgress(s, dayKey, now);
  if (!prog.length) return null;
  return (
    <ol className="dots" aria-label="오늘 진행">
      {prog.map((p) => (
        <li key={p.anchor.id} className={`dot-item ${p.state}`} title={`${main(p.anchor)} · ${STATE_LABEL[p.state]}`}>
          <span className="dot-icon" aria-hidden="true">{iconOf(p.anchor)}</span>
          <span className="sr">{main(p.anchor)}: {STATE_LABEL[p.state]}</span>
        </li>
      ))}
    </ol>
  );
}
