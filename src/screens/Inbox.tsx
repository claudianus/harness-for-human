// 컨텍스트 관리: 캡처한 것을 분류한다. 오늘 할 일 / 나중에 / 아이디어 / 버림
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { Btn, Card, Chips, Empty, IconBtn, ScreenHeader, TextInput } from '../components/ui';
import { atom, useAtom } from '../lib/atom';
import { timeAgo } from '../lib/time';
import { toast } from '../lib/toast';
import { addCapture, dayKey, getDay, uid, type Capture, type CaptureStatus, type State } from '../store/model';
import { store, useStore } from '../store/store';
import { openTool } from './Think';

type Tab = Exclude<CaptureStatus, 'done'>;
const TABS: { value: Tab; label: string }[] = [
  { value: 'inbox', label: '미처리' },
  { value: 'later', label: '나중에' },
  { value: 'idea', label: '아이디어' },
];
const tabAtom = atom<Tab>('inbox');

export default function Inbox() {
  const s = useStore();
  const navigate = useNavigate();
  const [tab, setTab] = useAtom(tabAtom);
  const [text, setText] = useState('');
  const counts = Object.fromEntries(TABS.map((t) => [t.value, s.captures.filter((c) => c.status === t.value).length])) as Record<Tab, number>;
  const items = s.captures.filter((c) => c.status === tab);
  const sessionGoal = (id: string | null) => (id ? s.sessions.find((x) => x.id === id)?.goal : undefined);

  const set = (id: string, fn: (c: Capture, st: State) => void) => store.update((st) => { const c = st.captures.find((x) => x.id === id); if (c) fn(c, st); });
  const toToday = (c: Capture, st: State) => {
    const d = getDay(st, dayKey());
    if (d.top3.length >= 3) {
      c.status = 'later';
      toast('오늘의 3가지가 꽉 차서 “나중에”로 옮겼습니다.');
    } else {
      d.top3.push({ id: uid(), text: c.text, done: false });
      c.status = 'done';
      toast('오늘의 중요한 일에 추가했습니다.');
    }
  };
  const remove = (id: string) => store.update((st) => { st.captures = st.captures.filter((x) => x.id !== id); });

  const actions = (c: Capture) => {
    if (tab === 'inbox') return <>
      <Btn cls="ghost sm" onClick={() => set(c.id, toToday)}>오늘</Btn>
      <Btn cls="ghost sm" onClick={() => set(c.id, (x) => { x.status = 'later'; })}>나중에</Btn>
      <Btn cls="ghost sm" onClick={() => set(c.id, (x) => { x.status = 'idea'; })}>아이디어</Btn>
      <IconBtn name="x" label="버리기" onClick={() => remove(c.id)} />
    </>;
    if (tab === 'later') return <>
      <Btn cls="ghost sm" onClick={() => set(c.id, toToday)}>오늘로</Btn>
      <IconBtn name="x" label="삭제" onClick={() => remove(c.id)} />
    </>;
    return <>
      <Btn cls="ghost sm" onClick={() => { openTool('brainstorm', c.text); navigate('/think'); }}>생각 도구로</Btn>
      <IconBtn name="x" label="삭제" onClick={() => remove(c.id)} />
    </>;
  };

  return (
    <div className="stack">
      <ScreenHeader id="inbox" />
      <Card>
        <TextInput cls="big" value={text} onChange={setText} placeholder="떠오른 것을 그대로. Enter로 저장" onEnter={(v) => {
          if (!v.trim()) return;
          store.update((st) => addCapture(st, v));
          setText('');
        }} />
        <p className="hint">어디서든 상단 ＋ 버튼이나 ⌘K / Ctrl+K로 바로 캡처할 수 있다.</p>
      </Card>
      <Chips cls="tabs" value={tab} onPick={setTab} options={TABS.map((t) => ({ value: t.value, label: `${t.label}${counts[t.value] ? ` ${counts[t.value]}` : ''}` }))} />
      <Card cls="list-card">
        {items.length ? (
          <ul className="cap-items">
            {items.map((c) => (
              <li key={c.id}>
                <div className="grow">
                  <div>{c.text}</div>
                  <div className="meta">{timeAgo(c.at)}{sessionGoal(c.sessionId) && ` · 세션 중: ${sessionGoal(c.sessionId)}`}</div>
                </div>
                <div className="cap-actions">{actions(c)}</div>
              </li>
            ))}
          </ul>
        ) : <Empty>{tab === 'inbox' ? '비어 있다. 머릿속도 이만큼 가벼우면 좋겠다.' : '없음'}</Empty>}
      </Card>
    </div>
  );
}
