// 평가 루프: 한 주의 데이터를 보고, 하네스 자체를 고친다. 결론은 매뉴얼 규칙이 된다.
import type { ReactNode } from 'react';
import { Btn, Card, Chips, Field, ScreenHeader, TextArea } from '../components/ui';
import { atom, useAtom } from '../lib/atom';
import { fmtDate, minutesBetween } from '../lib/time';
import { toast } from '../lib/toast';
import { activeRules, addRule, dayKey, uid, weekStart, type Review as ReviewRec, type State } from '../store/model';
import { store, useStore } from '../store/store';

type Which = 'last' | 'this';
const draftAtom = atom({ wins: '', misses: '', change: '', toRule: true });
const pickAtom = atom<Which | null>(null); // 직접 고르기 전엔 자동

function weekKeys(ws: Date) {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(ws);
    d.setDate(d.getDate() + i);
    return dayKey(d);
  });
}

export function weekStats(s: State, ws: Date) {
  const start = ws.getTime();
  const end = new Date(ws);
  end.setDate(end.getDate() + 7);
  const keys = weekKeys(ws);
  const sessions = s.sessions.filter((x) => x.status === 'done' && x.startAt >= start && x.startAt < end.getTime());
  const met = sessions.filter((x) => x.verdict === 'met').length;
  const mins = sessions.reduce((a, x) => a + minutesBetween(x.startAt, x.endAt), 0);
  const days = keys.map((k) => s.days[k]).filter(Boolean);
  const top = days.flatMap((d) => d.top3);
  const logs = s.logs.filter((l) => keys.includes(l.day));
  const sleeps = days.map((d) => d.sleep).filter((v): v is number => v != null);
  const habits = s.habits.filter((x) => x.status === 'active');
  return {
    sessions: sessions.length, met, mins,
    topDone: top.filter((x) => x.done).length, topAll: top.length,
    shutdowns: days.filter((d) => d.shutdown.done).length,
    energy: logs.length ? (logs.reduce((a, l) => a + l.energy, 0) / logs.length).toFixed(1) : '–',
    sleep: sleeps.length ? (sleeps.reduce((a, b) => a + b, 0) / sleeps.length).toFixed(1) : '–',
    habitRate: habits.length ? Math.round((habits.reduce((a, x) => a + keys.filter((k) => x.done[k]).length, 0) / (habits.length * 7)) * 100) : null,
    blockers: sessions.filter((x) => x.verdict !== 'met' && x.reflection?.trim()).map((x) => ({ id: x.id, goal: x.goal, text: x.reflection! })),
    captures: s.captures.filter((c) => c.at >= start && c.at < end.getTime()).length,
  };
}

// 월·화요일엔 막 끝난 지난주를 먼저 보여 준다 (아직 회고하지 않았다면).
export function targetWeek(s: State, pick: Which | null, now = new Date()) {
  const thisWs = weekStart(now);
  const lastWs = new Date(thisWs);
  lastWs.setDate(lastWs.getDate() - 7);
  const lastDone = s.reviews.some((r) => r.week === dayKey(lastWs));
  const early = [1, 2].includes(now.getDay());
  const which: Which = pick || (early && !lastDone ? 'last' : 'this');
  return { which, ws: which === 'last' ? lastWs : thisWs };
}

const Stat = ({ label, value, sub }: { label: string; value: ReactNode; sub?: ReactNode }) => (
  <div className="stat"><div className="stat-v">{value}</div><div className="stat-l">{label}</div>{sub && <div className="muted small">{sub}</div>}</div>
);

export default function Review() {
  const s = useStore();
  const [pick, setPick] = useAtom(pickAtom);
  const [draft, setDraft] = useAtom(draftAtom);
  const { which, ws } = targetWeek(s, pick);
  const st = weekStats(s, ws);
  const weekId = dayKey(ws);
  const wl = which === 'last' ? '지난주' : '이번 주';
  const already = s.reviews.find((r) => r.week === weekId);
  const rules = activeRules(s);
  const past = s.reviews.filter((r) => r.week !== weekId);

  const save = () => {
    if (!draft.change.trim()) return toast('바꿀 한 가지는 꼭 적어 주세요. 회고의 출력물입니다.');
    const d = draft;
    const { blockers: _b, ...stats } = st;
    void _b;
    store.update((x) => {
      x.reviews.unshift({ id: uid(), week: weekId, at: Date.now(), wins: d.wins.trim(), misses: d.misses.trim(), change: d.change.trim(), stats });
      if (d.toRule) addRule(x, d.change, '', 'review');
    });
    setDraft({ wins: '', misses: '', change: '', toRule: true });
    setPick(null);
    toast(d.toRule ? '저장했습니다. 매뉴얼에 규칙이 추가됐습니다.' : '저장했습니다.');
  };

  return (
    <div className="stack">
      <ScreenHeader id="review" title="주간 회고" />
      <Chips options={[{ value: 'last' as Which, label: '지난주' }, { value: 'this' as Which, label: '이번 주' }]} value={which} onPick={setPick} />

      <Card title={`${wl} 측정값`} tag={`${fmtDate(ws)} 주`}>
        <div className="stats">
          <Stat label="집중 세션" value={st.sessions} sub={`${st.mins}분`} />
          <Stat label="기준 충족" value={st.sessions ? `${Math.round((st.met / st.sessions) * 100)}%` : '–'} sub={st.sessions ? `${st.met}/${st.sessions}` : undefined} />
          <Stat label="중요한 일 완료" value={st.topAll ? `${st.topDone}/${st.topAll}` : '–'} />
          <Stat label="하루 종료" value={`${st.shutdowns}일`} />
          <Stat label="평균 에너지" value={st.energy} />
          <Stat label="평균 수면" value={st.sleep === '–' ? '–' : `${st.sleep}h`} />
          {st.habitRate != null && <Stat label="습관 실행" value={`${st.habitRate}%`} />}
          <Stat label="캡처" value={st.captures} />
        </div>
        {st.blockers.length > 0 && (
          <div className="blockers">
            <div className="mini-label">{wl} 세션을 막은 것들</div>
            <ul>{st.blockers.map((b) => <li key={b.id}><span className="muted">{b.goal} · </span>{b.text}</li>)}</ul>
          </div>
        )}
      </Card>

      {rules.length > 0 && (
        <Card title="규칙 점검" sub="규칙도 코드처럼 리팩터링한다. 몸에 익었으면 졸업, 안 맞으면 삭제.">
          <ul className="rule-list">
            {rules.map((r) => (
              <li key={r.id} className="rule">
                <div className="grow">{r.trigger && <span className="trigger">{r.trigger}</span>}<span className="rule-text">{r.text}</span></div>
                <div className="rule-actions">
                  <Btn cls="ghost sm" onClick={() => store.update((x) => { const y = x.rules.find((z) => z.id === r.id); if (y) { y.status = 'graduated'; y.graduatedAt = Date.now(); } })}>졸업</Btn>
                  <Btn cls="ghost sm danger" onClick={() => store.update((x) => { x.rules = x.rules.filter((z) => z.id !== r.id); })}>삭제</Btn>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {already ? (
        <Card title={`${wl} 회고 완료`} cls="accent-soft">
          <ReviewBody r={already} />
          {which === 'this' && <p className="hint">다음 주 월요일에 새 회고가 열린다.</p>}
        </Card>
      ) : (
        <Card title={`${wl} 회고`} sub="10분이면 충분하다. 결론은 행동 하나.">
          <Field label="잘 작동한 것"><TextArea rows={2} value={draft.wins} placeholder="계속할 것" onChange={(v) => setDraft((d) => ({ ...d, wins: v }))} /></Field>
          <Field label="막힌 것, 새는 곳"><TextArea rows={2} value={draft.misses} placeholder="위의 측정값과 막힌 것들을 참고" onChange={(v) => setDraft((d) => ({ ...d, misses: v }))} /></Field>
          <Field label="다음 주에 하네스를 바꿀 한 가지"><TextArea rows={2} value={draft.change} placeholder="예: 오전 9~11시엔 메신저를 끈다" onChange={(v) => setDraft((d) => ({ ...d, change: v }))} /></Field>
          <label className="check-line">
            <input type="checkbox" checked={draft.toRule} onChange={(e) => setDraft((d) => ({ ...d, toRule: e.target.checked }))} />
            이 한 가지를 매뉴얼 규칙으로 추가
          </label>
          <div className="row end"><Btn cls="primary" onClick={save}>회고 저장</Btn></div>
        </Card>
      )}

      {past.length > 0 && (
        <Card title="지난 회고">
          {past.slice(0, 8).map((r) => (
            <details key={r.id} className="past">
              <summary>{r.week} 주 · {r.change}</summary>
              <ReviewBody r={r} />
            </details>
          ))}
        </Card>
      )}
    </div>
  );
}

function ReviewBody({ r }: { r: ReviewRec }) {
  return (
    <dl className="brief">
      {r.wins && <><dt>잘 작동한 것</dt><dd>{r.wins}</dd></>}
      {r.misses && <><dt>막힌 것</dt><dd>{r.misses}</dd></>}
      <dt>바꿀 한 가지</dt><dd>{r.change}</dd>
    </dl>
  );
}
