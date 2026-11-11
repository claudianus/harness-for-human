// "하루" 화면: 오늘 정해진 순서와 지금까지 한 것. 잘못 누른 기록은 여기서 고친다.
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { clearOutcome, record, reopenDay, requestWrap } from '../core/actions';
import { dayProgress, dayStartMin, logicalKey, prevKey } from '../core/engine';
import { STATE_LABEL, dateLabel, hm } from '../core/format';
import { iconOf } from '../core/templates';
import { useNow } from '../lib/hooks';
import { peekDay, type OutcomeStatus } from '../store/model';
import { store, useStore } from '../store/store';

const FIX: { v: OutcomeStatus; label: string }[] = [
  { v: 'done', label: '했어요' }, { v: 'min', label: '최소만' }, { v: 'missed', label: '못 했어요' },
];

export default function Day() {
  const s = useStore();
  const now = useNow(15_000);
  const navigate = useNavigate();
  const [open, setOpen] = useState<string | null>(null);
  const key = logicalKey(now, dayStartMin(s.profile));
  const prog = dayProgress(s, key, now);
  const day = peekDay(s, key);

  // 지난 7일: 한 것 / 해야 했던 것
  const week: { key: string; did: number; total: number }[] = [];
  let k = key;
  for (let i = 0; i < 7; i++) {
    k = prevKey(k);
    const p = dayProgress(s, k, now).filter((x) => x.state !== 'na');
    week.unshift({ key: k, did: p.filter((x) => x.state === 'done' || x.state === 'min').length, total: p.length });
  }
  const tracked = week.filter((w) => w.total > 0);

  return (
    <div className="stack">
      <header className="screen-head">
        <h1>오늘 하루</h1>
        <p className="muted">{dateLabel(key)}{day.closed ? ' · 마감함' : ''}</p>
      </header>

      <section className="card">
        {prog.length === 0 ? <p className="empty">오늘 정해진 할 일이 없어요.</p> : (
          <ol className="timeline">
            {prog.map((p) => {
              const fixable = p.state !== 'upcoming' && p.state !== 'na';
              const isOpen = open === p.anchor.id;
              return (
                <li key={p.anchor.id} className={`tl ${p.state}`}>
                  <button type="button" className="tl-row" disabled={!fixable} aria-expanded={fixable ? isOpen : undefined}
                    onClick={() => setOpen(isOpen ? null : p.anchor.id)}>
                    <span className="tl-time">{hm(p.at)}</span>
                    <span className="tl-icon" aria-hidden="true">{iconOf(p.anchor)}</span>
                    <span className="grow">{p.anchor.target === 'min' ? p.anchor.minimum : p.anchor.title}</span>
                    <span className={`tl-state ${p.state}`}>{STATE_LABEL[p.state]}</span>
                  </button>
                  {isOpen && (
                    <div className="tl-fix">
                      <span className="muted small">기록 고치기</span>
                      <div className="chips">
                        {FIX.map((f) => (
                          <button key={f.v} type="button" className={`chip ${p.state === f.v ? 'on' : ''}`}
                            onClick={() => { const t = Date.now(); store.update((st) => record(st, key, p.anchor.id, f.v, t)); setOpen(null); }}>{f.label}</button>
                        ))}
                        {day.outcomes[p.anchor.id] && (
                          <button type="button" className="chip" onClick={() => { store.update((st) => clearOutcome(st, key, p.anchor.id)); setOpen(null); }}>기록 지우기</button>
                        )}
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ol>
        )}
        <div className="row">
          {day.closed
            ? <button type="button" className="btn ghost" onClick={() => store.update((st) => reopenDay(st, key))}>마감 취소하기</button>
            : <button type="button" className="btn" onClick={() => { store.update((st) => requestWrap(st, key, true)); navigate('/now'); }}>하루 마감하기</button>}
        </div>
      </section>

      {tracked.length > 0 && (
        <section className="card">
          <div className="card-head"><h2>지난 7일</h2></div>
          <ol className="week">
            {week.map((w) => (
              <li key={w.key} className={w.total === 0 ? 'none' : w.did === 0 ? 'zero' : w.did === w.total ? 'all' : 'some'}>
                <span className="week-bar" style={{ '--p': w.total ? w.did / w.total : 0 } as React.CSSProperties} />
                <span className="week-label">{dateLabel(w.key).split(' ')[2][0]}</span>
                <span className="sr">{dateLabel(w.key)}: {w.total ? `${w.total}개 중 ${w.did}개` : '기록 없음'}</span>
              </li>
            ))}
          </ol>
          <p className="muted small">하나라도 한 날이 {tracked.filter((w) => w.did > 0).length}일이에요. 다 못 한 날이 있어도 괜찮아요. 다시 돌아오는 게 중요해요.</p>
        </section>
      )}
    </div>
  );
}
