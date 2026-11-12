// "기록" 화면: 맡긴 것(메모·녹음·알림)과 일기를 다시 찾는 곳. 기억은 여기에 있다.
import { useState } from 'react';
import Clip from '../components/Clip';
import { resolveItem, setJournal, writeNote } from '../core/actions';
import { dayProgress, dayStartMin, logicalKey } from '../core/engine';
import { MOODS, dateLabel, whenLabel } from '../core/format';
import { download, itemIcs } from '../core/ics';
import { deleteItem } from '../lib/items';
import { useNow } from '../lib/hooks';
import { timeAgo } from '../lib/time';
import { toast } from '../lib/toast';
import { peekDay, type Item, type Mood } from '../store/model';
import { store, useStore } from '../store/store';

type Filter = 'open' | 'memo' | 'voice' | 'done' | 'journal';
const FILTERS: { v: Filter; label: string }[] = [
  { v: 'open', label: '할 일·알림' }, { v: 'memo', label: '메모' }, { v: 'voice', label: '녹음' }, { v: 'done', label: '끝난 것' }, { v: 'journal', label: '일기' },
];
const EMPTY: Record<Filter, string> = {
  open: '맡겨 둔 게 없어요. 아래 ＋ 버튼으로 떠오른 걸 맡겨 보세요.',
  memo: '보관한 메모가 없어요. 저녁 마감 때 “그냥 메모예요”를 고르면 여기 모여요.',
  voice: '녹음이 없어요. ＋ 버튼에서 “말로 남기기”를 눌러 보세요.',
  done: '아직 끝낸 게 없어요.',
  journal: '',
};

function setStatus(i: Item, status: 'done' | 'inbox') {
  const t = Date.now();
  store.update((st) => resolveItem(st, i.id, status, t));
}

export default function Records() {
  const s = useStore();
  const now = useNow(30_000);
  const [filter, setFilter] = useState<Filter>('open');
  const [q, setQ] = useState('');
  const ds = dayStartMin(s.profile);

  const match = (i: Item) => {
    if (q.trim() && !i.text.toLowerCase().includes(q.trim().toLowerCase())) return false;
    if (q.trim()) return true; // 찾을 때는 전부에서 찾는다
    if (filter === 'open') return i.status === 'inbox' && !i.keep;
    if (filter === 'memo') return i.status === 'inbox' && !!i.keep;
    if (filter === 'voice') return !!i.audio;
    return i.status !== 'inbox';
  };
  const list = s.items.filter(match).sort((a, b) => (filter === 'open' && !q.trim() ? (a.due ?? Infinity) - (b.due ?? Infinity) || b.at - a.at : b.at - a.at));

  const remove = (i: Item) => {
    if (!confirm('이 기록을 지울까요? 되돌릴 수 없어요.')) return;
    deleteItem(i);
  };

  return (
    <div className="stack">
      <header className="screen-head">
        <h1>기록</h1>
        <p className="muted">맡긴 것과 일기는 전부 여기 있어요. 기억나지 않으면 찾아보세요.</p>
      </header>
      <input className="field" type="search" placeholder="찾기 (예: 열쇠, 병원)" aria-label="기록에서 찾기" value={q} onChange={(e) => setQ(e.target.value)} />
      {!q.trim() && (
        <div className="chips" role="group" aria-label="종류">
          {FILTERS.map((f) => <button key={f.v} type="button" className={`chip ${filter === f.v ? 'on' : ''}`} aria-pressed={filter === f.v} onClick={() => setFilter(f.v)}>{f.label}</button>)}
        </div>
      )}

      {filter === 'journal' && !q.trim() ? <Journal now={now} /> : (
        <section className="card">
          {list.length === 0 ? <p className="empty">{q.trim() ? '찾는 내용이 없어요.' : EMPTY[filter]}</p> : (
            <ul className="records">
              {list.map((i) => (
                <li key={i.id} className={i.status === 'done' ? 'is-done' : ''}>
                  <div className="rec-main">
                    <span className="rec-text">{i.text}</span>
                    <span className="muted small">
                      {i.due != null ? `⏰ ${whenLabel(i.due, now, ds)}${i.travel ? ` · 가는 데 ${i.travel}분` : ''}` : i.keep ? '메모' : '시각 없음'}{i.status === 'dropped' ? ' · 못 함' : ''} · {timeAgo(i.at)} 맡김
                    </span>
                    {i.audio && <Clip audio={i.audio} />}
                  </div>
                  <div className="rec-actions">
                    {i.status === 'inbox' && !i.keep && <button type="button" className="btn sm" onClick={() => { setStatus(i, 'done'); toast('좋아요. 하나 끝났어요.'); }}>했어요</button>}
                    {i.status !== 'inbox' && <button type="button" className="btn ghost sm" onClick={() => setStatus(i, 'inbox')}>되돌리기</button>}
                    {i.status === 'inbox' && i.due != null && i.due > now && <button type="button" className="btn ghost sm" onClick={() => download(`${i.text.slice(0, 20) || '알림'}.ics`, itemIcs(i))}>캘린더에 넣기</button>}
                    <button type="button" className="btn ghost sm danger" onClick={() => remove(i)}>지우기</button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}

function Journal({ now }: { now: number }) {
  const s = useStore();
  const today = logicalKey(now, dayStartMin(s.profile));
  const day = peekDay(s, today);
  const past = Object.keys(s.days).filter((k) => k !== today && (s.days[k].mood || s.days[k].note)).sort().reverse();
  const did = (k: string) => {
    const p = dayProgress(s, k, now).filter((x) => x.state !== 'na');
    return p.length ? `${p.length}개 중 ${p.filter((x) => x.state === 'done' || x.state === 'min').length}개 함` : '';
  };
  return (
    <>
      <section className="card">
        <div className="card-head"><h2>오늘 일기</h2><span className="tag">{dateLabel(today)}</span></div>
        <div className="moods" role="group" aria-label="오늘 기분">
          {MOODS.map((m) => (
            <button key={m.v} type="button" className={`mood ${day.mood === m.v ? 'on' : ''}`} aria-pressed={day.mood === m.v} aria-label={m.label} title={m.label}
              onClick={() => store.update((st) => setJournal(st, today, { mood: m.v as Mood }))}>{m.icon}</button>
          ))}
        </div>
        <textarea className="field" rows={2} maxLength={200} placeholder="오늘 한 줄 (안 써도 됩니다)" aria-label="오늘 한 줄 일기" value={day.note ?? ''}
          onChange={(e) => { const v = e.target.value; store.update((st) => writeNote(st, today, v)); }} />
        <p className="hint">길게 말하고 싶으면 ＋ 버튼에서 말로 남기세요. 저녁 마감 때도 한 번 여쭤봅니다.</p>
      </section>
      <section className="card">
        <div className="card-head"><h2>지난 일기</h2></div>
        {past.length === 0 ? <p className="empty">아직 없어요. 하루를 마감할 때 기분만 눌러도 여기에 쌓여요.</p> : (
          <ul className="journal">
            {past.map((k) => (
              <li key={k}>
                <span className="mood-mark" aria-hidden="true">{MOODS.find((m) => m.v === s.days[k].mood)?.icon ?? '·'}</span>
                <div className="grow">
                  <div className="muted small">{dateLabel(k)}{did(k) && ` · ${did(k)}`}</div>
                  {s.days[k].note && <div>{s.days[k].note}</div>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
