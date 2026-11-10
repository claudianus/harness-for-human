import { store, MODULES, dayKey } from '../store.js';
import { h, card, screenHeader, btn, chips, toast } from '../ui.js';

export function render(s) {
  const root = h('div', { class: 'stack' },
    h('header', { class: 'screen-head' },
      h('div', { class: 'layer' }, '하네스 설정'),
      h('h1', {}, '설정'),
      h('p', { class: 'muted' }, '스스로 고른 하네스가 잘 작동한다. 안 쓰는 모듈은 끄자.')));

  const enabled = MODULES.filter((m) => s.settings.modules[m.id]).length;
  root.append(card({ title: '모듈' },
    h('ul', { class: 'module-list' }, MODULES.map((m) => h('li', {},
      h('label', { class: 'switch-line' },
        h('input', {
          type: 'checkbox', role: 'switch', checked: s.settings.modules[m.id],
          onChange: (e) => {
            if (!e.target.checked && enabled <= 1) {
              e.target.checked = true;
              return toast('모듈은 하나 이상 켜 두어야 합니다.');
            }
            store.update((st) => { st.settings.modules[m.id] = e.target.checked; });
          },
        }),
        h('span', { class: 'grow' }, h('strong', {}, m.name), h('span', { class: 'muted small' }, ` · ${m.layer}`), h('br'), h('span', { class: 'muted small' }, m.desc))))))));

  root.append(card({ title: '집중 세션 기본 시간' },
    chips([15, 25, 50, 90].map((m) => ({ value: m, label: `${m}분` })), s.settings.focusMin, (v) => store.update((st) => { st.settings.focusMin = v; }))));

  const fileIn = h('input', {
    type: 'file', accept: 'application/json,.json', hidden: true,
    onChange: async (e) => {
      const f = e.target.files[0];
      if (!f) return;
      try {
        const text = await f.text();
        if (!confirm('지금 데이터를 백업 파일 내용으로 바꿀까요? 현재 데이터는 사라집니다.')) return;
        store.importJSON(text);
        toast('가져왔습니다.');
      } catch (err) {
        toast(`가져오기 실패: ${err.message}`);
      }
    },
  });
  root.append(card({ title: '데이터', sub: '모든 기록은 이 기기의 브라우저에만 저장된다. 서버로 보내지 않는다. 기기를 바꾸거나 브라우저 데이터를 지우기 전에 백업하자.' },
    h('div', { class: 'row wrap' },
      btn('백업 내보내기 (JSON)', () => {
        const blob = new Blob([store.exportJSON()], { type: 'application/json' });
        const a = h('a', { href: URL.createObjectURL(blob), download: `human-harness-${dayKey()}.json` });
        document.body.append(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      }, 'ghost'),
      btn('백업 가져오기', () => fileIn.click(), 'ghost'),
      btn('전부 초기화', () => {
        if (confirm('모든 기록을 지웁니다. 되돌릴 수 없습니다. 계속할까요?')) {
          store.reset();
          toast('초기화했습니다.');
        }
      }, 'ghost danger')),
    fileIn));

  root.append(card({ title: '이 앱의 원리', cls: 'muted-card' },
    h('table', { class: 'map-table' },
      h('thead', {}, h('tr', {}, h('th', {}, 'AI 하네스'), h('th', {}, '사람 하네스'))),
      h('tbody', {}, [
        ['시스템 프롬프트', '오늘: 한 문장, 중요한 3가지, if-then'],
        ['에이전트 루프', '집중: 목표 → 완료기준 → 실행 → 검증'],
        ['컨텍스트 관리', '캡처: 작업기억 비우기'],
        ['도구', '생각: 프리모템, 5 Whys, 결정 매트릭스…'],
        ['리소스 관리', '리듬: 에너지, 수면, 습관'],
        ['메모리 (CLAUDE.md)', '매뉴얼: 경험에서 배운 규칙'],
        ['평가 루프', '회고: 측정하고 하네스를 고친다'],
      ].map(([a, b]) => h('tr', {}, h('td', {}, a), h('td', {}, b)))))));
  return root;
}
