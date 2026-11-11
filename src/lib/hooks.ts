import { useEffect, useState } from 'react';
import { dayKey } from '../store/model';

// 1초마다 바뀌는 현재 시각 (타이머 표시용)
export function useNow(ms = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}

const typing = () => !!document.activeElement?.matches('input, textarea, select');

// 오늘 날짜 키. 자정을 넘기거나 앱으로 돌아오면 새 날로 바뀐다.
// 입력 중이면 쓰던 날짜를 유지하고, 손을 뗀 뒤 다음 확인 때 바꾼다.
export function useDayKey(): string {
  const [key, setKey] = useState(() => dayKey());
  useEffect(() => {
    const check = () => { if (!typing()) setKey(dayKey()); };
    const t = setInterval(check, 5_000);
    document.addEventListener('visibilitychange', check);
    return () => {
      clearInterval(t);
      document.removeEventListener('visibilitychange', check);
    };
  }, []);
  return key;
}
