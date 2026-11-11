import { useRef, useState } from 'react';
import { Btn, Card, Chips, Field, ScreenHeader, TextInput } from '../components/ui';
import { isIOS, isStandalone, notify, notifySupported, permission, requestPermission, type Permission } from '../lib/notify';
import { toast } from '../lib/toast';
import { MODULES, dayKey, type NotifySettings } from '../store/model';
import { store, useStore } from '../store/store';

const MAP: [string, string][] = [
  ['시스템 프롬프트', '오늘: 한 문장, 중요한 3가지, if-then'],
  ['에이전트 루프', '집중: 목표 → 완료기준 → 실행 → 검증'],
  ['컨텍스트 관리', '캡처: 작업기억 비우기'],
  ['도구', '생각: 프리모템, 5 Whys, 결정 매트릭스…'],
  ['리소스 관리', '리듬: 에너지, 수면, 습관'],
  ['메모리 (CLAUDE.md)', '매뉴얼: 경험에서 배운 규칙'],
  ['평가 루프', '회고: 측정하고 하네스를 고친다'],
];

export default function Settings() {
  const s = useStore();
  const fileRef = useRef<HTMLInputElement>(null);
  const enabled = MODULES.filter((m) => s.settings.modules[m.id]).length;

  const exportBackup = () => {
    const blob = new Blob([store.exportJSON()], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `human-harness-${dayKey()}.json`;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };

  const importBackup = async (input: HTMLInputElement) => {
    const f = input.files?.[0];
    if (!f) return;
    try {
      const text = await f.text();
      if (!confirm('지금 데이터를 백업 파일 내용으로 바꿀까요? 현재 데이터는 사라집니다.')) return;
      store.importJSON(text);
      toast('가져왔습니다.');
    } catch (err) {
      toast(`가져오기 실패: ${(err as Error).message}`);
    } finally {
      input.value = ''; // 같은 파일을 다시 골라도 change가 일어나도록
    }
  };

  return (
    <div className="stack">
      <ScreenHeader layer="하네스 설정" title="설정" desc="스스로 고른 하네스가 잘 작동한다. 안 쓰는 모듈은 끄자." />

      <Card title="모듈">
        <ul className="module-list">
          {MODULES.map((m) => (
            <li key={m.id}>
              <label className="switch-line">
                <input type="checkbox" role="switch" checked={s.settings.modules[m.id]} onChange={(e) => {
                  if (!e.target.checked && enabled <= 1) return toast('모듈은 하나 이상 켜 두어야 합니다.');
                  const on = e.target.checked;
                  store.update((st) => { st.settings.modules[m.id] = on; });
                }} />
                <span className="grow">
                  <strong>{m.name}</strong><span className="muted small"> · {m.layer}</span><br />
                  <span className="muted small">{m.desc}</span>
                </span>
              </label>
            </li>
          ))}
        </ul>
      </Card>

      <Card title="집중 세션 기본 시간">
        <Chips options={[15, 25, 50, 90].map((m) => ({ value: m, label: `${m}분` }))} value={s.settings.focusMin} onPick={(v) => store.update((st) => { st.settings.focusMin = v; })} />
      </Card>

      <NotifyCard n={s.settings.notify} />

      <Card title="데이터" sub="모든 기록은 이 기기의 브라우저에만 저장된다. 서버로 보내지 않는다. 기기를 바꾸거나 브라우저 데이터를 지우기 전에 백업하자.">
        <div className="row wrap">
          <Btn cls="ghost" onClick={exportBackup}>백업 내보내기 (JSON)</Btn>
          <Btn cls="ghost" onClick={() => fileRef.current?.click()}>백업 가져오기</Btn>
          <Btn cls="ghost danger" onClick={() => {
            if (confirm('모든 기록을 지웁니다. 되돌릴 수 없습니다. 계속할까요?')) { store.reset(); toast('초기화했습니다.'); }
          }}>전부 초기화</Btn>
        </div>
        <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={(e) => void importBackup(e.currentTarget)} />
      </Card>

      <Card title="이 앱의 원리" cls="muted-card">
        <table className="map-table">
          <thead><tr><th>AI 하네스</th><th>사람 하네스</th></tr></thead>
          <tbody>{MAP.map(([a, b]) => <tr key={a}><td>{a}</td><td>{b}</td></tr>)}</tbody>
        </table>
      </Card>
    </div>
  );
}

const PERM_LABEL: Record<Permission, string> = {
  granted: '허용됨',
  denied: '차단됨',
  default: '아직 묻지 않음',
  unsupported: '이 브라우저는 지원하지 않음',
};

function NotifyCard({ n }: { n: NotifySettings }) {
  const [perm, setPerm] = useState<Permission>(permission);
  const set = (fn: (x: NotifySettings) => void) => store.update((st) => fn(st.settings.notify));
  const needsInstall = isIOS() && !isStandalone();

  return (
    <Card title="알림" tag={PERM_LABEL[perm]}>
      <p className="sub">
        서버 없이 이 기기에서만 울리는 알림이다. 앱이 열려 있거나 백그라운드에 살아 있을 때만 온다. 앱을 완전히 닫으면 오지 않는다.
      </p>
      {needsInstall && <p className="hint">아이폰·아이패드는 공유 → “홈 화면에 추가”로 설치한 뒤 그 앱에서 알림을 켤 수 있다.</p>}
      {perm === 'default' && notifySupported() && (
        <Btn cls="primary sm" onClick={async () => { setPerm(await requestPermission()); }}>알림 허용하기</Btn>
      )}
      {perm === 'denied' && <p className="hint">브라우저 주소창의 사이트 설정에서 알림을 허용으로 바꿔 주세요.</p>}

      <ul className="module-list">
        <li>
          <label className="switch-line">
            <input type="checkbox" role="switch" checked={n.timer} onChange={(e) => { const v = e.target.checked; set((x) => { x.timer = v; }); }} />
            <span className="grow"><strong>집중 시간 종료</strong><br /><span className="muted small">다른 창을 보고 있어도 세션이 끝나면 알려 준다.</span></span>
          </label>
        </li>
      </ul>
      <div className="row wrap gap">
        <Field label="아침 계획 알림" hint="오늘의 한 문장을 아직 안 썼으면">
          <TextInput type="time" label="아침 계획 알림 시각" value={n.morning} onChange={(v) => set((x) => { x.morning = v; })} />
        </Field>
        <Field label="하루 종료 알림" hint="하루 종료 의식을 아직 안 했으면">
          <TextInput type="time" label="하루 종료 알림 시각" value={n.evening} onChange={(v) => set((x) => { x.evening = v; })} />
        </Field>
      </div>
      <p className="hint">시각을 비우면 그 알림은 꺼진다.</p>
      {perm === 'granted' && (
        <Btn cls="ghost sm" onClick={async () => {
          const ok = await notify('휴먼 하네스', { body: '알림이 이렇게 온다.', tag: 'test', route: '/settings' });
          if (!ok) toast('알림을 보내지 못했습니다.');
        }}>테스트 알림 보내기</Btn>
      )}
    </Card>
  );
}
