// 음성 메모. 소리는 localStorage에 넣기엔 너무 커서 IndexedDB에 따로 둔다.
// 그래서 JSON 백업에는 들어가지 않는다 (글과 시각만 백업된다).
const DB = 'human-harness-audio';
const STORE = 'clips';

export interface Clip { blob: Blob; mime: string; ms: number; at: number }

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  try {
    return await new Promise<T>((resolve, reject) => {
      const t = db.transaction(STORE, mode);
      const req = fn(t.objectStore(STORE));
      t.oncomplete = () => resolve(req.result);
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error);
    });
  } finally {
    db.close();
  }
}

export const putClip = (id: string, clip: Clip) => tx('readwrite', (s) => s.put(clip, id));
export const getClip = (id: string) => tx<Clip | undefined>('readonly', (s) => s.get(id));
export const deleteClip = (id: string) => tx('readwrite', (s) => s.delete(id));
export const clearClips = () => tx('readwrite', (s) => s.clear());
// 어떤 기록에도 달려 있지 않은 녹음을 지운다 (백업을 불러온 뒤 등)
export async function pruneClips(keep: Set<string>) {
  const keys = await tx<IDBValidKey[]>('readonly', (s) => s.getAllKeys());
  for (const k of keys) if (typeof k === 'string' && !keep.has(k)) await deleteClip(k);
}

// 브라우저마다 녹음 형식이 다르다 (크롬: webm, 사파리: mp4)
const MIMES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'];
export function recordMime(): string | null {
  if (typeof MediaRecorder === 'undefined' || !navigator.mediaDevices?.getUserMedia || typeof indexedDB === 'undefined') return null;
  return MIMES.find((m) => MediaRecorder.isTypeSupported(m)) ?? '';
}
export const canRecord = () => recordMime() !== null;

export interface Recording { stop: () => Promise<{ blob: Blob; mime: string; ms: number }>; cancel: () => void }

// 반드시 버튼을 누른 동작 안에서 호출한다 (마이크 권한 요청).
export async function startRecording(): Promise<Recording> {
  const mime = recordMime();
  if (mime === null) throw new Error('이 브라우저는 녹음을 지원하지 않아요.');
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
  const chunks: Blob[] = [];
  const startedAt = Date.now();
  rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
  const release = () => stream.getTracks().forEach((t) => t.stop());
  rec.start();
  return {
    stop: () => new Promise((resolve) => {
      rec.onstop = () => {
        release();
        const type = rec.mimeType || mime || 'audio/webm';
        resolve({ blob: new Blob(chunks, { type }), mime: type, ms: Date.now() - startedAt });
      };
      rec.stop();
    }),
    cancel: () => {
      rec.onstop = release;
      if (rec.state !== 'inactive') rec.stop(); else release();
    },
  };
}

// 오래 안 열어도 브라우저가 기록을 지우지 않도록 요청한다 (거절될 수 있다).
export async function keepStorage(): Promise<boolean> {
  try { return (await navigator.storage?.persist?.()) ?? false; } catch { return false; }
}
