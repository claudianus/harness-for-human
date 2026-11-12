// ＋ 맡기기: 떠오른 것을 글이나 말로 맡긴다. 분류는 시키지 않는다.
// 시각을 고르면 알림·약속이 되고, 안 고르면 저녁에 앱이 "이건 언제 할까요?" 하고 묻는다.
import { useEffect, useRef, useState } from 'react';
import { addItem } from '../core/actions';
import { dayStartMin, slotAt } from '../core/engine';
import { clipLength, whenLabel } from '../core/format';
import { download, itemIcs } from '../core/ics';
import { atom, useAtom } from '../lib/atom';
import { canRecord, deleteClip, keepStorage, putClip, startRecording, type Recording } from '../lib/audio';
import { useNow } from '../lib/hooks';
import { toast } from '../lib/toast';
import { uid, type AudioRef, type Item } from '../store/model';
import { store } from '../store/store';
import { Icon } from './ui';

export const captureAtom = atom(false);
const TRAVEL = [0, 10, 20, 30, 60];

export default function Capture() {
  const [open, setOpen] = useAtom(captureAtom);
  const ref = useRef<HTMLDialogElement>(null);
  const dirty = useRef(false); // 적거나 녹음한 게 있으면 바깥을 눌러도, Esc를 눌러도 닫지 않는다
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <>
      <button type="button" className="fab" aria-label="맡기기 (메모, 녹음, 알림)" onClick={() => setOpen(true)}>
        <Icon name="plus" size={26} />
      </button>
      <dialog ref={ref} className="sheet" aria-label="맡기기" onClose={() => { dirty.current = false; setOpen(false); }}
        onCancel={(e) => { if (dirty.current) e.preventDefault(); }}
        onClick={(e) => { if (e.target === ref.current && !dirty.current) setOpen(false); }}>
        {open && <Sheet close={() => { dirty.current = false; setOpen(false); }} onDirty={(b) => { dirty.current = b; }} />}
      </dialog>
    </>
  );
}

function Sheet({ close, onDirty }: { close: () => void; onDirty: (b: boolean) => void }) {
  const [base] = useState(() => Date.now());
  const [text, setText] = useState('');
  const [due, setDue] = useState<number | null>(null);
  const [custom, setCustom] = useState(false);
  const [travel, setTravel] = useState(0);
  const [audio, setAudio] = useState<AudioRef | null>(null);
  const [rec, setRec] = useState<{ r: Recording; at: number } | null>(null);
  const [saved, setSaved] = useState<Item | null>(null);
  const now = useNow();
  const pending = useRef<{ audio: AudioRef | null; rec: Recording | null; kept: boolean }>({ audio: null, rec: null, kept: false });

  // 저장하지 않고 닫으면 녹음을 버린다
  useEffect(() => {
    const p = pending.current;
    return () => {
      p.rec?.cancel();
      if (p.audio && !p.kept) void deleteClip(p.audio.id).catch(() => {});
    };
  }, []);

  const st = store.get();
  const profile = st.profile;
  const ds = dayStartMin(profile);
  const at = (dayOffset: number, hhmm: string) => slotAt(st, base, dayOffset, hhmm);
  const quick = [
    { label: '30분 뒤', ts: base + 30 * 60000 },
    { label: '1시간 뒤', ts: base + 60 * 60000 },
    { label: '오늘 저녁 7시', ts: at(0, '19:00') },
    { label: `내일 ${profile.wake.slice(0, 2) === '12' ? '낮' : '아침'}`, ts: at(1, profile.wake) + 60 * 60000 },
  ].filter((q) => q.ts > base + 5 * 60000);

  const record = async () => {
    try {
      const r = await startRecording();
      pending.current.rec = r;
      setRec({ r, at: Date.now() });
    } catch (e) {
      toast(e instanceof DOMException ? '마이크를 쓸 수 없어요. 브라우저에서 마이크를 허용해 주세요.' : e instanceof Error ? e.message : '녹음을 시작하지 못했어요.');
    }
  };
  const stop = async () => {
    if (!rec) return;
    const clip = await rec.r.stop();
    pending.current.rec = null;
    setRec(null);
    const a: AudioRef = { id: uid(), mime: clip.mime, ms: clip.ms };
    try {
      await putClip(a.id, { blob: clip.blob, mime: clip.mime, ms: clip.ms, at: Date.now() });
      pending.current.audio = a;
      setAudio(a);
    } catch {
      toast('녹음을 저장하지 못했어요. 저장 공간을 확인해 주세요.');
    }
  };
  const dropAudio = () => {
    if (audio) void deleteClip(audio.id).catch(() => {});
    pending.current.audio = null;
    setAudio(null);
  };

  const ok = text.trim() !== '' || audio != null;
  const busy = (ok || rec != null) && saved == null;
  const report = useRef(onDirty);
  useEffect(() => { report.current(busy); }, [busy]);
  const save = () => {
    if (!ok || rec) return;
    const t = Date.now();
    let item: Item | null = null;
    store.update((s) => { item = { ...addItem(s, { text, due: due ?? undefined, travel, audio: audio ?? undefined }, t) }; });
    pending.current.kept = true;
    void keepStorage();
    if (due != null && item) setSaved(item);
    else { toast('맡았어요. 이제 잊어버려도 됩니다.'); close(); }
  };

  if (saved) {
    return (
      <div className="sheet-body">
        <strong className="sheet-title">맡았어요.</strong>
        <p className="lead">{whenLabel(saved.due! - (saved.travel ?? 0) * 60000, now, ds)}에 {saved.travel ? '출발하라고 ' : ''}알려 드릴게요.</p>
        <p className="muted small">이 앱은 열려 있을 때만 울릴 수 있어요. 꼭 울려야 하는 일이면 휴대폰 캘린더에도 넣어 두세요. 캘린더는 앱이 닫혀 있어도 울립니다.</p>
        <div className="now-actions">
          <button type="button" className="btn xl" onClick={() => { download(`${saved.text.slice(0, 20) || '알림'}.ics`, itemIcs(saved)); close(); }}>캘린더에도 넣기</button>
          <button type="button" className="btn primary xl" onClick={close}>됐어요</button>
        </div>
      </div>
    );
  }

  return (
    <form className="sheet-body" onSubmit={(e) => { e.preventDefault(); save(); }}>
      <div className="sheet-head"><strong className="sheet-title">맡기기</strong><span className="muted small">적거나 말하세요. 기억은 제가 합니다.</span></div>
      <textarea className="field" rows={3} placeholder="예: 3시에 병원 전화, 엄마 생신 선물, 열쇠는 신발장 위" aria-label="맡길 내용" value={text} autoFocus
        onChange={(e) => setText(e.target.value)} />

      {canRecord() && (
        <div className="row">
          {rec ? (
            <button type="button" className="btn danger rec" onClick={() => void stop()}><span className="rec-dot" />녹음 중 {clipLength(now - rec.at)} · 멈추기</button>
          ) : audio ? (
            <><span className="tag live">🎙 녹음 {clipLength(audio.ms)}</span><button type="button" className="btn ghost sm" onClick={dropAudio}>지우기</button></>
          ) : (
            <button type="button" className="btn" onClick={() => void record()}>🎙 말로 남기기</button>
          )}
        </div>
      )}

      <div className="fieldset">
        <span className="label">언제 알려 드릴까요?</span>
        <div className="chips">
          <button type="button" className={`chip ${due == null && !custom ? 'on' : ''}`} onClick={() => { setDue(null); setCustom(false); }}>안 알려도 돼요</button>
          {quick.map((q) => (
            <button key={q.label} type="button" className={`chip ${due === q.ts && !custom ? 'on' : ''}`} onClick={() => { setDue(q.ts); setCustom(false); }}>{q.label}</button>
          ))}
          <button type="button" className={`chip ${custom ? 'on' : ''}`} onClick={() => { setCustom(true); setDue(null); }}>직접 고르기</button>
        </div>
        {custom && (
          <input type="datetime-local" className="field" aria-label="날짜와 시각"
            onChange={(e) => { const t = new Date(e.target.value).getTime(); setDue(Number.isFinite(t) ? t : null); }} />
        )}
      </div>

      {due != null && (
        <div className="fieldset">
          <span className="label">어디 가야 하는 일인가요? 가는 데 걸리는 시간</span>
          <div className="chips">
            {TRAVEL.map((m) => (
              <button key={m} type="button" className={`chip ${travel === m ? 'on' : ''}`} onClick={() => setTravel(m)}>{m === 0 ? '안 가요' : m === 60 ? '1시간' : `${m}분`}</button>
            ))}
          </div>
          <span className="hint">{travel ? `${whenLabel(due - travel * 60000, now, ds)}에 “지금 출발하세요”라고 알려 드려요.` : `${whenLabel(due, now, ds)}에 알려 드려요.`}</span>
        </div>
      )}

      <div className="row end">
        <button type="button" className="btn ghost" onClick={close}>닫기</button>
        <button type="submit" className="btn primary" disabled={!ok || !!rec}>맡기기</button>
      </div>
    </form>
  );
}
