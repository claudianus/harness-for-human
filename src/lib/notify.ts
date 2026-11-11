// 로컬 알림. 서버가 없으므로 앱이 열려 있거나 백그라운드에 살아 있을 때만 울린다.
// (앱을 완전히 닫으면 오지 않는다. 진짜 푸시는 발송 서버가 필요하다.)

export type Permission = NotificationPermission | 'unsupported';

export const notifySupported = () => typeof window !== 'undefined' && 'Notification' in window;

export function permission(): Permission {
  return notifySupported() ? Notification.permission : 'unsupported';
}

// 반드시 클릭 같은 사용자 동작 안에서 호출해야 한다 (브라우저 정책).
export async function requestPermission(): Promise<Permission> {
  if (!notifySupported()) return 'unsupported';
  return Notification.requestPermission();
}

export const isStandalone = () =>
  window.matchMedia?.('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone === true;

export const isIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

export interface NotifyOptions { body?: string; tag?: string; route?: string }

export async function notify(title: string, { body, tag, route = '/today' }: NotifyOptions = {}): Promise<boolean> {
  if (permission() !== 'granted') return false;
  const options: NotificationOptions = {
    body,
    tag,
    icon: 'icon-192.png',
    badge: 'icon-192.png',
    data: { route },
  };
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    if (reg) {
      await reg.showNotification(title, options);
      return true;
    }
    // 서비스 워커가 없을 때 (개발 서버 등)
    const n = new Notification(title, options);
    n.onclick = () => {
      window.focus();
      location.hash = `#${route}`;
      n.close();
    };
    return true;
  } catch (e) {
    console.warn('알림 실패', e);
    return false;
  }
}

// 하루 한 번만 보내는 알림의 발송 기록 (기기별, 데이터 백업에는 넣지 않는다)
const SENT_KEY = 'human-harness.notified';
export function sentToday(id: string): boolean {
  try { return JSON.parse(localStorage.getItem(SENT_KEY) || '{}')[id] === true; } catch { return false; }
}
export function markSent(id: string) {
  try {
    const all = JSON.parse(localStorage.getItem(SENT_KEY) || '{}') as Record<string, boolean>;
    all[id] = true;
    // 오래된 기록은 정리 (최근 50개만)
    const keys = Object.keys(all);
    for (const k of keys.slice(0, Math.max(0, keys.length - 50))) delete all[k];
    localStorage.setItem(SENT_KEY, JSON.stringify(all));
  } catch { /* noop */ }
}

// 'HH:MM'이 오늘 지났고, 아직 2시간 안이면 true (앱을 늦게 열었을 때 한참 지난 알림은 보내지 않는다)
export function isDue(hhmm: string, now = new Date()): boolean {
  if (!/^\d{2}:\d{2}$/.test(hhmm)) return false;
  const [h, m] = hhmm.split(':').map(Number);
  const at = new Date(now);
  at.setHours(h, m, 0, 0);
  const diff = now.getTime() - at.getTime();
  return diff >= 0 && diff < 2 * 3600_000;
}
