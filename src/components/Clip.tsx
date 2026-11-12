// 녹음 듣기. 소리는 IndexedDB에서 누를 때 꺼내 온다.
import { useEffect, useRef, useState } from 'react';
import { clipLength } from '../core/format';
import { getClip } from '../lib/audio';
import type { AudioRef } from '../store/model';

export default function Clip({ audio }: { audio: AudioRef }) {
  const [url, setUrl] = useState<string | null>(null);
  const [missing, setMissing] = useState(false);
  const made = useRef<string | null>(null);
  useEffect(() => () => { if (made.current) URL.revokeObjectURL(made.current); }, []);

  const load = async () => {
    try {
      const c = await getClip(audio.id);
      if (!c) { setMissing(true); return; }
      made.current = URL.createObjectURL(c.blob);
      setUrl(made.current);
    } catch {
      setMissing(true);
    }
  };
  if (missing) return <span className="muted small">🎙 녹음이 이 기기에 없어요 (다른 기기에서 녹음했거나 지워졌어요)</span>;
  if (url) return <audio className="clip" src={url} controls autoPlay />;
  return <button type="button" className="btn sm clip-btn" onClick={() => void load()}>▶ 녹음 듣기 {clipLength(audio.ms)}</button>;
}
