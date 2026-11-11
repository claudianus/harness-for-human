// "나" 화면: 루틴 손보기, 알림, 백업. 매일 들어올 곳은 아니다.
import { useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { dayStartMin, offsetOf } from '../core/engine';
import { spoken } from '../core/format';
import { iconOf } from '../core/templates';
import { isIOS, isStandalone, permission, requestPermission, type Permission } from '../lib/notify';
import { toast } from '../lib/toast';
import { dayKey, type Anchor } from '../store/model';
import { store, useStore } from '../store/store';
import { resetupAtom } from './Setup';

const editAnchor = (id: string, fn: (a: Anchor) => void) =>
  store.update((s) => { const a = s.anchors.find((x) => x.id === id); if (a) fn(a); });

export default function Me() {
  const anchors = useStore((s) => s.anchors);
  const profile = useStore((s) => s.profile);
  const notifyOn = useStore((s) => s.settings.notify);
  const items = useStore((s) => s.items).filter((i) => i.status === 'inbox');
  const [perm, setPerm] = useState<Permission>(() => permission());
  const file = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  const ds = dayStartMin(profile);
  const active = anchors.filter((a) => a.status === 'active').sort((a, b) => offsetOf(a.time, ds) - offsetOf(b.time, ds));
  const paused = anchors.filter((a) => a.status === 'paused');

  const exportBackup = () => {
    const blob = new Blob([store.exportJSON()], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `human-harness-${dayKey()}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const importBackup = async (f: File) => {
    try {
      const text = await f.text();
      if (!confirm('지금 데이터를 백업 파일 내용으로 바꿀까요? 지금 기록은 사라집니다.')) return;
      store.importJSON(text);
      toast('백업을 불러왔어요.');
    } catch (e) {
      toast(e instanceof SyntaxError ? '파일을 읽을 수 없어요. 백업 파일이 맞는지 확인해 주세요.' : e instanceof Error ? e.message : '불러오지 못했어요.');
    }
  };

  return (
    <div className="stack">
      <header className="screen-head">
        <h1>나</h1>
        <p className="muted">{spoken(profile.wake)}에 일어나고 {spoken(profile.sleep)}에 자는 하루로 맞춰 두었어요.</p>
      </header>

      <section className="card">
        <div className="card-head"><h2>지금 하는 루틴</h2><span className="tag">{active.length}개</span></div>
        <p className="sub">처음 2주는 늘리지 않는 게 좋아요. 시간이 안 맞으면 시간만 바꿔 주세요.</p>
        <ul className="routines">
          {active.map((a) => <Routine key={a.id} a={a} />)}
        </ul>
      </section>

      {paused.length > 0 && (
        <section className="card">
          <div className="card-head"><h2>쉬고 있는 루틴</h2></div>
          <p className="sub">예전 앱에서 옮겨 온 습관이나 잠시 쉬는 루틴이에요. 다시 하려면 시간을 정하고 켜 주세요.</p>
          <ul className="routines">
            {paused.map((a) => <Routine key={a.id} a={a} />)}
          </ul>
        </section>
      )}

      <section className="card">
        <div className="card-head"><h2>알림</h2></div>
        {perm === 'unsupported' ? (
          <p className="sub">{isIOS() && !isStandalone() ? '아이폰은 Safari 공유 버튼 → ‘홈 화면에 추가’로 설치하면 알림을 받을 수 있어요.' : '이 브라우저는 알림을 지원하지 않아요.'}</p>
        ) : perm === 'granted' ? (
          <label className="switch-line">
            <input type="checkbox" checked={notifyOn} onChange={(e) => store.update((s) => { s.settings.notify = e.target.checked; })} />
            <span className="grow">할 시간이 되면 알려 주기<br /><span className="muted small">앱이 열려 있거나 백그라운드에 있을 때만 울려요. 완전히 닫으면 오지 않아요.</span></span>
          </label>
        ) : perm === 'denied' ? (
          <p className="sub">알림이 꺼져 있어요. 브라우저 설정에서 이 사이트의 알림을 허용해 주세요.</p>
        ) : (
          <>
            <p className="sub">할 시간이 되면 알려 드릴게요. 기억하지 않으셔도 되도록요.</p>
            <button type="button" className="btn primary" onClick={async () => setPerm(await requestPermission())}>알림 켜기</button>
          </>
        )}
      </section>

      {items.length > 0 && (
        <section className="card">
          <div className="card-head"><h2>예전에 적어 둔 메모</h2><span className="tag">{items.length}</span></div>
          <ul className="memo">
            {items.map((i) => (
              <li key={i.id}>
                <span className="grow">{i.text}</span>
                <button type="button" className="btn ghost sm" onClick={() => store.update((s) => { const x = s.items.find((y) => y.id === i.id); if (x) x.status = 'done'; })}>처리함</button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="card">
        <div className="card-head"><h2>설정과 백업</h2></div>
        <div className="row">
          <button type="button" className="btn" onClick={() => { resetupAtom.set(true); navigate('/now'); }}>처음부터 다시 설정</button>
        </div>
        <p className="sub">질문 4개에 다시 답하고 루틴을 새로 받아요. 지난 기록은 그대로 남아요.</p>
        <p className="sub">기록은 이 기기의 브라우저에만 저장돼요. 기기를 바꾸거나 브라우저 데이터를 지우기 전에 백업해 두세요.</p>
        <div className="row">
          <button type="button" className="btn ghost" onClick={exportBackup}>백업 내보내기</button>
          <button type="button" className="btn ghost" onClick={() => file.current?.click()}>백업 불러오기</button>
          <input ref={file} type="file" accept="application/json,.json" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void importBackup(f); }} />
          <button type="button" className="btn ghost danger" onClick={() => { if (confirm('모든 기록과 루틴을 지웁니다. 되돌릴 수 없어요. 계속할까요?')) { store.reset(); toast('초기화했어요.'); } }}>모두 지우기</button>
        </div>
      </section>

      <p className="disclaimer muted small">휴먼 하네스는 생활 습관을 돕는 도구이며 의료 서비스가 아닙니다. ADHD나 우울 등으로 힘들다면 전문의와 상담해 주세요.</p>
    </div>
  );
}

function Routine({ a }: { a: Anchor }) {
  const isActive = a.status === 'active';
  return (
    <li className="routine">
      <div className="routine-head">
        <span className="tl-icon" aria-hidden="true">{iconOf(a)}</span>
        <div className="grow">
          <strong>{a.title}</strong>
          <div className="muted small">최소 버전: {a.minimum}</div>
        </div>
      </div>
      <div className="routine-ctl">
        <input type="time" className="field time" step={900} value={a.time} aria-label={`${a.title} 시간`}
          onChange={(e) => { const v = e.target.value; if (/^\d{2}:\d{2}$/.test(v)) editAnchor(a.id, (x) => { x.time = v; }); }} />
        <div className="chips" role="group" aria-label="목표">
          {(['full', 'min'] as const).map((t) => (
            <button key={t} type="button" className={`chip ${a.target === t ? 'on' : ''}`} aria-pressed={a.target === t}
              onClick={() => editAnchor(a.id, (x) => { x.target = t; })}>{t === 'full' ? '원래대로' : '최소만'}</button>
          ))}
        </div>
        <button type="button" className="btn ghost sm" onClick={() => { const t = Date.now(); editAnchor(a.id, (x) => { x.status = isActive ? 'paused' : 'active'; if (!isActive) x.createdAt = t; }); }}>
          {isActive ? '쉬기' : '다시 하기'}
        </button>
      </div>
    </li>
  );
}
