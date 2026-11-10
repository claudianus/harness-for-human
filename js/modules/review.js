// 평가 루프: 이번 주 데이터를 보고, 하네스 자체를 고친다. 결론은 매뉴얼 규칙이 된다.
import { store, uid, weekStart, dayKey, activeRules, addRule } from '../store.js';
import { h, card, textarea, field, screenHeader, btn, empty, toast, fmtDate } from '../ui.js';

let draft = { wins: '', misses: '', change: '', toRule: true };

function weekKeys(ws) {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(ws);
    d.setDate(d.getDate() + i);
    return dayKey(d);
  });
}

function weekStats(s, ws) {
  const start = ws.getTime();
  const end = start + 7 * 864e5;
  const keys = weekKeys(ws);
  const sessions = s.sessions.filter((x) => x.status === 'done' && x.startAt >= start && x.startAt < end);
  const met = sessions.filter((x) => x.verdict === 'met').length;
  const mins = sessions.reduce((a, x) => a + Math.round((x.endAt - x.startAt) / 60000), 0);
  const days = keys.map((k) => s.days[k]).filter(Boolean);
  const top = days.flatMap((d) => d.top3);
  const shutdowns = days.filter((d) => d.shutdown?.done).length;
  const logs = s.logs.filter((l) => keys.includes(l.day));
  const energy = logs.length ? (logs.reduce((a, l) => a + l.energy, 0) / logs.length).toFixed(1) : '–';
  const sleeps = days.map((d) => d.sleep).filter((v) => v != null);
  const sleep = sleeps.length ? (sleeps.reduce((a, b) => a + b, 0) / sleeps.length).toFixed(1) : '–';
  const habits = s.habits.filter((x) => x.status === 'active');
  const habitRate = habits.length
    ? Math.round((habits.reduce((a, x) => a + keys.filter((k) => x.done[k]).length, 0) / (habits.length * 7)) * 100)
    : null;
  const blockers = sessions.filter((x) => x.verdict !== 'met' && x.reflection?.trim()).map((x) => ({ goal: x.goal, text: x.reflection }));
  const captures = s.captures.filter((c) => c.at >= start && c.at < end).length;
  return { sessions: sessions.length, met, mins, topDone: top.filter((x) => x.done).length, topAll: top.length, shutdowns, energy, sleep, habitRate, blockers, captures };
}

export function render(s, ctx) {
  const ws = weekStart();
  const st = weekStats(s, ws);
  const weekId = dayKey(ws);
  const already = s.reviews.find((r) => r.week === weekId);
  const root = h('div', { class: 'stack' }, screenHeader('review', '주간 회고'));

  const stat = (label, value, sub) => h('div', { class: 'stat' }, h('div', { class: 'stat-v' }, value), h('div', { class: 'stat-l' }, label), sub && h('div', { class: 'muted small' }, sub));
  root.append(card({ title: '이번 주 측정값', tag: `${fmtDate(ws)} 주` },
    h('div', { class: 'stats' },
      stat('집중 세션', st.sessions, `${st.mins}분`),
      stat('기준 충족', st.sessions ? `${Math.round((st.met / st.sessions) * 100)}%` : '–', st.sessions ? `${st.met}/${st.sessions}` : null),
      stat('중요한 일 완료', st.topAll ? `${st.topDone}/${st.topAll}` : '–'),
      stat('하루 종료', `${st.shutdowns}일`),
      stat('평균 에너지', st.energy),
      stat('평균 수면', st.sleep === '–' ? '–' : `${st.sleep}h`),
      st.habitRate != null && stat('습관 실행', `${st.habitRate}%`),
      stat('캡처', st.captures)),
    st.blockers.length > 0 && h('div', { class: 'blockers' },
      h('div', { class: 'mini-label' }, '이번 주 세션을 막은 것들'),
      h('ul', {}, st.blockers.map((b) => h('li', {}, h('span', { class: 'muted' }, `${b.goal} · `), b.text))))));

  const rules = activeRules(s);
  if (rules.length) {
    root.append(card({ title: '규칙 점검', sub: '규칙도 코드처럼 리팩터링한다. 몸에 익었으면 졸업, 안 맞으면 삭제.' },
      h('ul', { class: 'rule-list' }, rules.map((r) => h('li', { class: 'rule' },
        h('div', { class: 'grow' }, r.trigger && h('span', { class: 'trigger' }, r.trigger), h('span', { class: 'rule-text' }, r.text)),
        h('div', { class: 'rule-actions' },
          btn('졸업', () => store.update((x) => { const y = x.rules.find((z) => z.id === r.id); y.status = 'graduated'; y.graduatedAt = Date.now(); }), 'ghost sm'),
          btn('삭제', () => store.update((x) => { x.rules = x.rules.filter((z) => z.id !== r.id); }), 'ghost sm danger')))))));
  }

  if (already) {
    root.append(card({ title: '이번 주 회고 완료', cls: 'accent-soft' },
      reviewBody(already),
      h('p', { class: 'hint' }, '다음 주 월요일에 새 회고가 열린다.')));
  } else {
    const set = (k) => (v) => { draft[k] = v; };
    root.append(card({ title: '회고', sub: '10분이면 충분하다. 결론은 행동 하나.' },
      field('잘 작동한 것', textarea({ value: draft.wins, placeholder: '계속할 것', rows: 2, onInput: set('wins') })),
      field('막힌 것, 새는 곳', textarea({ value: draft.misses, placeholder: '위의 측정값과 막힌 것들을 참고', rows: 2, onInput: set('misses') })),
      field('다음 주에 하네스를 바꿀 한 가지', textarea({ value: draft.change, placeholder: '예: 오전 9~11시엔 메신저를 끈다', rows: 2, onInput: set('change') })),
      h('label', { class: 'check-line' },
        h('input', { type: 'checkbox', checked: draft.toRule, onChange: (e) => { draft.toRule = e.target.checked; } }),
        '이 한 가지를 매뉴얼 규칙으로 추가'),
      h('div', { class: 'row end' }, btn('회고 저장', () => {
        if (!draft.change.trim()) return toast('바꿀 한 가지는 꼭 적어 주세요. 회고의 출력물입니다.');
        const d = draft;
        store.update((x) => {
          x.reviews.unshift({ id: uid(), week: weekId, at: Date.now(), wins: d.wins.trim(), misses: d.misses.trim(), change: d.change.trim(), stats: { ...st, blockers: undefined } });
          if (d.toRule) addRule(x, d.change, '', 'review');
        });
        draft = { wins: '', misses: '', change: '', toRule: true };
        toast(d.toRule ? '저장했습니다. 매뉴얼에 규칙이 추가됐습니다.' : '저장했습니다.');
      }, 'primary'))));
  }

  const past = s.reviews.filter((r) => r.week !== weekId);
  if (past.length) {
    root.append(card({ title: '지난 회고' },
      past.slice(0, 8).map((r) => h('details', { class: 'past' },
        h('summary', {}, `${r.week} 주 · ${r.change}`),
        reviewBody(r)))));
  }
  return root;
}

function reviewBody(r) {
  return h('dl', { class: 'brief' },
    r.wins && [h('dt', {}, '잘 작동한 것'), h('dd', {}, r.wins)],
    r.misses && [h('dt', {}, '막힌 것'), h('dd', {}, r.misses)],
    h('dt', {}, '바꿀 한 가지'), h('dd', {}, r.change));
}
