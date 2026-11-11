// 리소스 관리: 에너지 체크인으로 피크 시간을 찾고, 수면·움직임을 기록하고, 아주 작은 습관을 쌓는다.
import { Btn, Card, Chips, Empty, Field, IconBtn, ScreenHeader, TextInput } from '../components/ui';
import { atom, useAtom } from '../lib/atom';
import { useDayKey } from '../lib/hooks';
import { toast } from '../lib/toast';
import { dayKey, getDay, keyToDate, lastDayKeys, peekDay, uid, type Habit, type State } from '../store/model';
import { store, useStore } from '../store/store';

const ENERGY = [
  { value: 1, label: '1 바닥' }, { value: 2, label: '2 낮음' }, { value: 3, label: '3 보통' },
  { value: 4, label: '4 좋음' }, { value: 5, label: '5 최고' },
];
const BLOCKS = [
  { id: 'dawn', name: '새벽', from: 0, to: 6 },
  { id: 'am', name: '오전', from: 6, to: 12 },
  { id: 'pm', name: '오후', from: 12, to: 18 },
  { id: 'eve', name: '저녁', from: 18, to: 24 },
];
const WD = ['일', '월', '화', '수', '목', '금', '토'];

const habitDraftAtom = atom({ anchor: '', tiny: '' });

export default function Rhythm() {
  const s = useStore();
  const key = useDayKey();
  const day = peekDay(s, key);
  const todayLogs = s.logs.filter((l) => l.day === key);

  return (
    <div className="stack">
      <ScreenHeader id="rhythm" />
      <Card title="지금 에너지는?" sub="하루 2~3번, 탭 한 번. 쌓이면 나의 피크 시간이 보인다." tag={todayLogs.length ? `오늘 ${todayLogs.length}회` : null}>
        <Chips cls="energy" options={ENERGY} value={null} onPick={(v) => {
          store.update((st) => { st.logs.push({ id: uid(), at: Date.now(), day: key, hour: new Date().getHours(), energy: v }); });
          toast('기록했습니다.');
        }} />
        <div className="row wrap gap">
          <Field label="어젯밤 수면">
            <Chips options={[5, 6, 7, 8, 9].map((n) => ({ value: n, label: n === 9 ? '9h+' : n === 5 ? '≤5h' : `${n}h` }))} value={day.sleep}
              onPick={(v) => store.update((st) => { getDay(st, key).sleep = v; })} />
          </Field>
          <Field label="오늘 몸을 움직였나">
            <Chips options={[{ value: true, label: '움직였다' }, { value: false, label: '아직' }]} value={day.moved}
              onPick={(v) => store.update((st) => { getDay(st, key).moved = v; })} />
          </Field>
        </div>
      </Card>
      <Pattern s={s} todayKey={key} />
      <Habits s={s} todayKey={key} />
    </div>
  );
}

function Pattern({ s, todayKey }: { s: State; todayKey: string }) {
  const today = keyToDate(todayKey);
  const since = new Date(today).setDate(today.getDate() - 29); // 오늘 포함 30일
  const logs = s.logs.filter((l) => l.at >= since);
  const stats = BLOCKS.map((b) => {
    const xs = logs.filter((l) => l.hour >= b.from && l.hour < b.to);
    return { ...b, n: xs.length, avg: xs.length ? xs.reduce((a, l) => a + l.energy, 0) / xs.length : 0 };
  });
  const peak = stats.filter((x) => x.n >= 2).sort((a, b) => b.avg - a.avg)[0];
  const days = lastDayKeys(7, today);

  return (
    <Card title="나의 패턴" sub="최근 30일 에너지 평균">
      {logs.length < 4 ? <Empty>체크인이 {4 - logs.length}번 더 쌓이면 시간대별 패턴이 나온다.</Empty> : (
        <div>
          <div className="blocks">
            {stats.map((b) => (
              <div key={b.id} className={`blk ${peak && b.id === peak.id ? 'peak' : ''}`}>
                <div className="blk-track"><div className="blk-fill" style={{ height: `${(b.avg / 5) * 100}%` }} /></div>
                <div className="blk-name">{b.name}</div>
                <div className="muted small">{b.n ? b.avg.toFixed(1) : '–'}</div>
              </div>
            ))}
          </div>
          {peak && <p className="hint accent">피크는 {peak.name}(평균 {peak.avg.toFixed(1)}). 가장 어려운 일은 이 시간에, 메일과 잡무는 바닥 시간에 두자.</p>}
        </div>
      )}
      <div className="mini-label" style={{ marginTop: 16 }}>최근 7일 수면 · 움직인 날은 점 표시</div>
      <div className="mini-bars">
        {days.map((k) => {
          const d = s.days[k];
          const v = d?.sleep;
          return (
            <div key={k} className="mb">
              <div className="mb-track"><div className={`mb-fill ${v != null && v < 7 ? 'low' : ''}`} style={{ height: v ? `${(v / 9) * 100}%` : '0' }} /></div>
              <span className={`mb-label ${d?.moved ? 'moved' : ''}`} title={d?.moved ? '움직인 날' : ''}>{WD[keyToDate(k).getDay()]}</span>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function streak(hb: Habit) {
  let n = 0;
  const d = new Date();
  if (!hb.done[dayKey(d)]) d.setDate(d.getDate() - 1); // 오늘 아직 안 했으면 어제부터 셈
  while (hb.done[dayKey(d)]) {
    n++;
    d.setDate(d.getDate() - 1);
  }
  return n;
}

function Habits({ s, todayKey }: { s: State; todayKey: string }) {
  const [draft, setDraft] = useAtom(habitDraftAtom);
  const active = s.habits.filter((x) => x.status === 'active');
  const grads = s.habits.filter((x) => x.status === 'graduated');
  const days = lastDayKeys(7);
  const add = () => {
    if (!draft.tiny.trim()) return toast('작은 행동을 적어 주세요.');
    store.update((st) => { st.habits.push({ id: uid(), anchor: draft.anchor.trim(), tiny: draft.tiny.trim(), status: 'active', done: {}, createdAt: Date.now() }); });
    setDraft({ anchor: '', tiny: '' });
  };
  const edit = (id: string, fn: (h: Habit) => void) => store.update((st) => { const x = st.habits.find((y) => y.id === id); if (x) fn(x); });

  return (
    <Card title="아주 작은 습관" sub="이미 하는 일 뒤에 붙이고, 바보 같을 만큼 작게. 동기가 아니라 설계로 만든다.">
      {active.length ? (
        <ul className="habits">
          {active.map((x) => (
            <li key={x.id}>
              <div className="habit-head">
                <div className="grow">
                  {x.anchor && <span className="trigger">{x.anchor} 후</span>}
                  <span className="rule-text">{x.tiny}</span>
                </div>
                <span className="streak" title="연속">{streak(x)}일</span>
              </div>
              <div className="habit-row">
                <div className="week-dots">
                  {days.map((k) => (
                    <button key={k} type="button" className={`wd ${x.done[k] ? 'on' : ''} ${k === todayKey ? 'today' : ''}`}
                      aria-label={`${k} ${x.done[k] ? '완료' : '미완료'}`} aria-pressed={!!x.done[k]}
                      onClick={() => edit(x.id, (h) => { if (h.done[k]) delete h.done[k]; else h.done[k] = true; })}>
                      {WD[keyToDate(k).getDay()]}
                    </button>
                  ))}
                </div>
                <div className="row tight">
                  {Object.keys(x.done).length >= 21 && <span className="muted small">졸업할 때?</span>}
                  <Btn cls="ghost sm" onClick={() => { edit(x.id, (h) => { h.status = 'graduated'; }); toast('졸업! 이제 하네스 없이도 된다.'); }}>졸업</Btn>
                  <IconBtn name="x" label="삭제" onClick={() => { if (confirm('이 습관을 지울까요?')) store.update((st) => { st.habits = st.habits.filter((y) => y.id !== x.id); }); }} />
                </div>
              </div>
            </li>
          ))}
        </ul>
      ) : <Empty>습관이 없다. 하나만 시작하자.</Empty>}
      <div className="rule-form">
        <Field label="이미 하는 일 (닻)"><TextInput value={draft.anchor} placeholder="예: 아침 커피를 내린" onChange={(v) => setDraft((d) => ({ ...d, anchor: v }))} onEnter={add} /></Field>
        <Field label="아주 작은 행동"><TextInput value={draft.tiny} placeholder="예: 스쿼트 2개" onChange={(v) => setDraft((d) => ({ ...d, tiny: v }))} onEnter={add} /></Field>
      </div>
      <div className="row end"><Btn cls="primary sm" onClick={add}>습관 추가</Btn></div>
      {grads.length > 0 && <p className="muted small">졸업한 습관: {grads.map((x) => x.tiny).join(', ')}</p>}
    </Card>
  );
}
