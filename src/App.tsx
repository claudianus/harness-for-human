import { useEffect, useState } from 'react';
import { Navigate, NavLink, Route, Routes, useLocation, useNavigate } from 'react-router';
import Capture from './components/Capture';
import { Icon } from './components/ui';
import { notifyTargets } from './core/notifier';
import { useAtom } from './lib/atom';
import { markSent, notify, sentToday } from './lib/notify';
import { beep, unlockAudio } from './lib/sound';
import { toastAtom } from './lib/toast';
import type { PersistEventDetail } from './store/store';
import { store, useStore } from './store/store';
import Day from './screens/Day';
import Me from './screens/Me';
import Now from './screens/Now';
import Records from './screens/Records';

const TABS = [
  { to: '/now', label: '지금', icon: 'now' },
  { to: '/day', label: '하루', icon: 'day' },
  { to: '/records', label: '기록', icon: 'inbox' },
  { to: '/me', label: '나', icon: 'me' },
];

export default function App() {
  const setupDone = useStore((s) => s.profile.setupAt != null);
  useScrollTopOnRoute();
  useNotifier();
  useServiceWorkerMessages();

  return (
    <>
      <SaveBanner />
      <header className="topbar">
        <span className="brand"><span className="brand-mark" aria-hidden="true" />휴먼 하네스</span>
      </header>
      <main className="view">
        <Routes>
          <Route path="/now" element={<Now />} />
          <Route path="/day" element={setupDone ? <Day /> : <Navigate to="/now" replace />} />
          <Route path="/records" element={setupDone ? <Records /> : <Navigate to="/now" replace />} />
          <Route path="/me" element={setupDone ? <Me /> : <Navigate to="/now" replace />} />
          <Route path="*" element={<Navigate to="/now" replace />} />
        </Routes>
      </main>
      {setupDone && <Capture />}
      {setupDone && (
        <nav className="nav" aria-label="화면" style={{ '--n': TABS.length } as React.CSSProperties}>
          {TABS.map((t) => (
            <NavLink key={t.to} to={t.to} className={({ isActive }) => `nav-item ${isActive ? 'on' : ''}`}>
              <Icon name={t.icon} size={22} />
              <span>{t.label}</span>
            </NavLink>
          ))}
        </nav>
      )}
      <Toast />
    </>
  );
}

function useScrollTopOnRoute() {
  const { pathname } = useLocation();
  useEffect(() => { window.scrollTo(0, 0); }, [pathname]);
}

// 알림: 할 시간이 된 닻, 하루 마감. 화면을 보고 있으면 이미 카드가 떠 있으므로 시스템 알림은 보내지 않는다.
// 같은 항목은 한 번만 (미뤄 둔 뒤 다시 나타나면 새 항목).
function useNotifier() {
  useEffect(() => {
    const check = () => {
      const s = store.get();
      for (const t of notifyTargets(s, Date.now())) {
        if (sentToday(t.id)) continue;
        if (!document.hidden) {
          markSent(t.id); // 화면에서 이미 봤다
          if (t.loud) beep(); // 약속은 화면을 보고 있어도 소리로 알린다
          continue;
        }
        if (!s.settings.notify) continue;
        void notify(t.title, { body: t.body, tag: t.tag, route: '/now' }).then((ok) => {
          if (ok) { markSent(t.id); beep(); }
        });
      }
    };
    check();
    const t = setInterval(check, 15_000);
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
      저장되지 않고 있어요. 브라우저 저장 공간이 꽉 찼거나 비공개 모드일 수 있어요. ‘나’ → 백업 내보내기로 지금 내용을 보관해 주세요.
    </div>
  );
}
