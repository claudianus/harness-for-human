import { useEffect, useRef, useState } from 'react';
import { Link, Navigate, NavLink, Route, Routes, useLocation, useNavigate } from 'react-router';
import { Icon } from './components/ui';
import { useAtom } from './lib/atom';
import { useNow } from './lib/hooks';
import { isDue, markSent, notify, sentToday } from './lib/notify';
import { beep, unlockAudio } from './lib/sound';
import { fmtClock } from './lib/time';
import { toast, toastAtom } from './lib/toast';
import { MODULES, addCapture, dayKey, peekDay, runningSession, type ModuleId } from './store/model';
import type { PersistEventDetail } from './store/store';
import { store, useStore } from './store/store';
import Focus from './screens/Focus';
import Inbox from './screens/Inbox';
import Manual from './screens/Manual';
import Review from './screens/Review';
import Rhythm from './screens/Rhythm';
import Settings from './screens/Settings';
import Think, { leaveThink } from './screens/Think';
import Today from './screens/Today';

const SCREENS: Record<ModuleId, () => React.JSX.Element> = { today: Today, focus: Focus, inbox: Inbox, think: Think, rhythm: Rhythm, manual: Manual, review: Review };

export default function App() {
  const modules = useStore((s) => s.settings.modules);
  const enabled = MODULES.filter((m) => modules[m.id]);
  const home = enabled[0] ? `/${enabled[0].id}` : '/settings';
  useRouteEffects();
  useNotifier();
  useServiceWorkerMessages();

  return (
    <>
      <SaveBanner />
      <header className="topbar">
        <Link className="brand" to="/today"><span className="brand-mark" aria-hidden="true" />휴먼 하네스</Link>
        <div className="top-actions">
          <SessionPill />
          <CaptureButton />
          <NavLink className={({ isActive }) => `icon-btn ${isActive ? 'on' : ''}`} to="/settings" aria-label="설정" title="설정">
            <Icon name="settings" size={20} />
          </NavLink>
        </div>
      </header>
      <main className="view">
        <Routes>
          {enabled.map((m) => {
            const Screen = SCREENS[m.id];
            return <Route key={m.id} path={`/${m.id}`} element={<Screen />} />;
          })}
          <Route path="/settings" element={<Settings />} />
          <Route path="*" element={<Navigate to={home} replace />} />
        </Routes>
      </main>
      <Nav />
      <Toast />
    </>
  );
}

function Nav() {
  const modules = useStore((s) => s.settings.modules);
  const inbox = useStore((s) => s.captures.filter((c) => c.status === 'inbox').length);
  const enabled = MODULES.filter((m) => modules[m.id]);
  return (
    <nav className="nav" aria-label="모듈" style={{ '--n': enabled.length } as React.CSSProperties}>
      {enabled.map((m) => (
        <NavLink key={m.id} to={`/${m.id}`} className={({ isActive }) => `nav-item ${isActive ? 'on' : ''}`}>
          <Icon name={m.id} size={22} />
          <span>{m.name}</span>
          {m.id === 'inbox' && inbox > 0 && <span className="badge">{inbox > 99 ? '99+' : inbox}</span>}
        </NavLink>
      ))}
    </nav>
  );
}

// 화면을 바꿀 때: 맨 위로 스크롤, 생각 편집기 정리
function useRouteEffects() {
  const { pathname } = useLocation();
  const prev = useRef(pathname);
  useEffect(() => {
    if (prev.current === pathname) return;
    if (prev.current === '/think') leaveThink();
    prev.current = pathname;
    window.scrollTo(0, 0);
  }, [pathname]);
}

function SessionPill() {
  const navigate = useNavigate();
  const cur = useStore(runningSession);
  const now = useNow();
  const left = cur ? cur.startAt + cur.plannedMin * 60000 - now : 0;
  useEffect(() => {
    document.title = cur ? `${fmtClock(left)} · ${cur.goal}` : '휴먼 하네스';
  }, [cur, left]);
  if (!cur) return null;
  return (
    <button type="button" className={`pill ${left < 0 ? 'over' : ''}`} title="집중 세션으로" onClick={() => navigate('/focus')}>
      {fmtClock(left)}
    </button>
  );
}

// 알림: 집중 시간 종료, 아침 계획, 하루 종료.
// 앱이 보이면 소리 + 토스트, 다른 창에 가려져 있으면 시스템 알림.
function useNotifier() {
  useEffect(() => {
    const notified = new Set<string>();
    const deliver = async (title: string, body: string, tag: string, route: string, systemOk: boolean) => {
      if (!document.hidden) {
        toast(body);
        return true;
      }
      return systemOk ? notify(title, { body, tag, route }) : false;
    };
    const check = () => {
      const s = store.get();
      const n = s.settings.notify;
      const cur = runningSession(s);
      if (cur) {
        const k = `${cur.id}:${cur.plannedMin}`;
        if (Date.now() >= cur.startAt + cur.plannedMin * 60000 && !notified.has(k)) {
          notified.add(k);
          beep();
          void deliver('집중 시간 종료', `시간 종료. 이제 기준 대비 검증할 차례. (${cur.goal})`, 'timer', '/focus', n.timer);
        }
      }
      const key = dayKey();
      const day = peekDay(s, key);
      const reminders = [
        { id: 'morning', at: n.morning, need: s.settings.modules.today && !day.intention.trim(), title: '오늘의 한 문장', body: '오늘이 끝났을 때 무엇이 되어 있으면 좋을까? 30초만.', route: '/today' },
        { id: 'evening', at: n.evening, need: s.settings.modules.today && !day.shutdown.done, title: '하루 종료', body: '잘된 것 하나, 내일 첫 행동 하나 적고 퇴근하자.', route: '/today' },
      ];
      for (const r of reminders) {
        const sid = `${key}:${r.id}`;
        if (!r.need || !isDue(r.at) || sentToday(sid) || notified.has(sid)) continue;
        notified.add(sid);
        void deliver(r.title, r.body, r.id, r.route, true).then((ok) => {
          if (ok) markSent(sid);
          else notified.delete(sid); // 못 보냈으면 앱으로 돌아왔을 때 다시
        });
      }
    };
    check();
    const t = setInterval(check, 1000);
    document.addEventListener('visibilitychange', check);
    window.addEventListener('pointerdown', unlockAudio, { once: true });
    return () => {
      clearInterval(t);
      document.removeEventListener('visibilitychange', check);
      window.removeEventListener('pointerdown', unlockAudio);
    };
  }, []);
}

// 알림을 누르면 서비스 워커가 해당 화면으로 보내 달라고 메시지를 보낸다.
function useServiceWorkerMessages() {
  const navigate = useNavigate();
  useEffect(() => {
    const sw = navigator.serviceWorker;
    if (!sw) return;
    const on = (e: MessageEvent) => {
      if (e.data?.type === 'navigate' && typeof e.data.route === 'string') navigate(e.data.route);
    };
    sw.addEventListener('message', on);
    return () => sw.removeEventListener('message', on);
  }, [navigate]);
}

function CaptureButton() {
  const ref = useRef<HTMLDialogElement>(null);
  const [text, setText] = useState('');
  const open = () => {
    setText('');
    ref.current?.showModal();
  };
  const save = () => {
    const v = text.trim();
    if (v) {
      store.update((st) => addCapture(st, v, runningSession(st)?.id || null));
      toast('캡처했습니다. 하던 일로 돌아가세요.');
    }
    ref.current?.close();
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        if (ref.current?.open) ref.current.close();
        else open();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <>
      <button type="button" className="btn primary sm capture-btn" title="캡처 (⌘K)" aria-label="캡처" onClick={open}>＋ 캡처</button>
      <dialog ref={ref} className="sheet" aria-label="캡처" onClick={(e) => { if (e.target === ref.current) ref.current.close(); }}>
        <form method="dialog" className="sheet-body" onSubmit={(e) => { e.preventDefault(); save(); }}>
          <div className="sheet-head"><strong>캡처</strong><span className="muted small">머릿속에서 꺼내기. 정리는 나중에.</span></div>
          <textarea className="field" rows={3} placeholder="떠오른 할 일, 걱정, 아이디어…" aria-label="캡처 내용" value={text} autoFocus
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing && e.keyCode !== 229) {
                e.preventDefault();
                save();
              }
            }} />
          <div className="row end">
            <button type="button" className="btn ghost" onClick={() => ref.current?.close()}>닫기</button>
            <button type="submit" className="btn primary">저장 <span className="kbd">Enter</span></button>
          </div>
        </form>
      </dialog>
    </>
  );
}

function Toast() {
  const [t] = useAtom(toastAtom);
  // 새 메시지마다 key가 바뀌어 다시 마운트 → 2.6초 뒤 사라짐
  return t ? <ToastView key={t.n} msg={t.msg} /> : <div className="toast" role="status" aria-live="polite" />;
}
function ToastView({ msg }: { msg: string }) {
  const [show, setShow] = useState(true);
  useEffect(() => {
    const h = setTimeout(() => setShow(false), 2600);
    return () => clearTimeout(h);
  }, []);
  return <div className={`toast ${show ? 'show' : ''}`} role="status" aria-live="polite">{msg}</div>;
}

// 저장 실패는 조용히 넘기지 않는다. 다음 저장이 성공할 때까지 배너를 띄운다.
function SaveBanner() {
  const [failing, setFailing] = useState(false);
  useEffect(() => {
    const on = (e: Event) => setFailing(!(e as CustomEvent<PersistEventDetail>).detail.ok);
    window.addEventListener('harness:persist', on);
    return () => window.removeEventListener('harness:persist', on);
  }, []);
  if (!failing) return null;
  return (
    <div className="save-error" role="alert">
      저장되지 않고 있습니다. 브라우저 저장 공간이 꽉 찼거나 비공개 모드일 수 있습니다. 설정 → 백업 내보내기로 지금 내용을 보관하세요.
    </div>
  );
}
