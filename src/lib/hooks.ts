import { useEffect, useState } from 'react';

// 1초마다 바뀌는 현재 시각 (타이머 표시용)
export function useNow(ms = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}
