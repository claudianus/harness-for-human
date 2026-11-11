import { store, MODULES, runningSession, addCapture, dayKey } from './store.js';
import { h, icon, toast, fmtClock, beep, focusNext, unlockAudio } from './ui.js';
import * as today from './modules/today.js';
import * as focus from './modules/focus.js';
import * as inbox from './modules/inbox.js';
import * as think from './modules/think.js';
import * as rhythm from './modules/rhythm.js';
import * as manual from './modules/manual.js';
import * as review from './modules/review.js';
import * as settings from './modules/settings.js';

const VIEWS = { today, focus, inbox, think, rhythm, manual, review, settings };

const viewEl = document.getElementById('view');
const navEl = document.getElementById('nav');
const pill = document.getElementById('session-pill');

let cleanups = [];
let lastRoute = null;
let renderedDay = dayKey();

const enabledModules = () => MODULES.filter((m) => store.get().settings.modules[m.id]);

function currentRoute() {
  const r = location.hash.replace(/^#\/?/, '').split('?')[0];
  if (r === 'settings') return r;
  if (VIEWS[r] && store.get().settings.modules[r]) return r;
  return enabledModules()[0]?.id || 'settings';
}

function navigate(r) {
  if (location.hash === `#/${r}`) render();
  else location.hash = `#/${r}`;
}

const ctx = {
  navigate,
  rerender: () => render(),
  onCleanup: (f) => cleanups.push(f),
  openThink: (tool, seed) => {
    think.open(tool, seed);
    navigate('think');
  },
};

function render() {
  cleanups.forEach((f) => { try { f(); } catch { /* noop */ } });
  cleanups = [];
  const r = currentRoute();
  // 화면을 떠날 때 모듈이 정리할 기회 (예: 비어 있는 생각 기록 지우기)
  if (lastRoute && r !== lastRoute) VIEWS[lastRoute]?.onLeave?.();
  const s = store.get();
  renderedDay = dayKey();
  const keepScroll = r === lastRoute;
  const y = window.scrollY;
  viewEl.replaceChildren(VIEWS[r].render(s, ctx));
  renderNav(r);
  window.scrollTo(0, keepScroll ? y : 0);
  lastRoute = r;
  document.getElementById('settings-link').classList.toggle('on', r === 'settings');
  if (focusNext.key) {
    const el = viewEl.querySelector(`[data-fk="${CSS.escape(focusNext.key)}"]`);
    focusNext.key = null;
    el?.focus();
  }
}

function renderNav(active) {
  const mods = enabledModules();
  navEl.style.setProperty('--n', mods.length);
  navEl.replaceChildren(...mods.map((m) => h('a', {
    href: `#/${m.id}`, class: `nav-item ${m.id === active ? 'on' : ''}`, 'aria-current': m.id === active ? 'page' : null,
  }, icon(m.id, 22), h('span', {}, m.name),
  m.id === 'inbox' && badge(store.get().captures.filter((c) => c.status === 'inbox').length))));
}

function badge(n) {
  return n ? h('span', { class: 'badge' }, n > 99 ? '99+' : n) : null;
}

// 상단 세션 표시 + 시간 종료 알림
const notified = new Set();
function tickPill() {
  const s = store.get();
  const cur = runningSession(s);
  if (!cur) {
    pill.hidden = true;
    document.title = '휴먼 하네스';
    return;
  }
  const left = cur.startAt + cur.plannedMin * 60000 - Date.now();
  pill.hidden = false;
  pill.textContent = fmtClock(left);
  pill.classList.toggle('over', left < 0);
  document.title = `${fmtClock(left)} · ${cur.goal}`;
  const nk = `${cur.id}:${cur.plannedMin}`;
  if (left <= 0 && !notified.has(nk)) {
    notified.add(nk);
    beep();
    toast('시간 종료. 이제 기준 대비 검증할 차례.');
  }
}
pill.addEventListener('click', () => navigate('focus'));
window.addEventListener('pointerdown', unlockAudio, { once: true });
const typing = () => document.activeElement?.matches('input,textarea,select');
setInterval(() => {
  tickPill();
  // 자정이 지나면 날짜를 쓰는 화면을 새 날로. 입력 중이면 손을 뗄 때까지 기다린다.
  if (dayKey() !== renderedDay && !typing() && !dlg.open) render();
}, 1000);

// 저장 실패는 조용히 넘기지 않는다. 다음 저장이 성공할 때까지 배너를 띄운다.
const saveBanner = h('div', { class: 'save-error', role: 'alert', hidden: true },
  '저장되지 않고 있습니다. 브라우저 저장 공간이 꽉 찼거나 비공개 모드일 수 있습니다. 설정 → 백업 내보내기로 지금 내용을 보관하세요.');
document.body.prepend(saveBanner);
window.addEventListener('harness:persist', (e) => { saveBanner.hidden = e.detail.ok; });

// 전역 캡처
const dlg = document.getElementById('capture-dialog');
const capText = document.getElementById('capture-text');
function openCapture() {
  capText.value = '';
  dlg.showModal();
  capText.focus();
}
function saveCapture() {
  const v = capText.value.trim();
  if (v) {
    store.update((s) => addCapture(s, v, runningSession(s)?.id || null));
    toast('캡처했습니다. 하던 일로 돌아가세요.');
  }
  dlg.close();
}
document.getElementById('capture-btn').addEventListener('click', openCapture);
document.getElementById('capture-save').addEventListener('click', (e) => {
  e.preventDefault();
  saveCapture();
});
capText.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && e.keyCode !== 229) {
    e.preventDefault();
    saveCapture();
  }
});
dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });
window.addEventListener('keydown', (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
    e.preventDefault();
    dlg.open ? dlg.close() : openCapture();
  }
});

store.subscribe(() => { render(); tickPill(); });
window.addEventListener('hashchange', render);
document.addEventListener('visibilitychange', () => { if (!document.hidden && dayKey() !== renderedDay && !typing()) render(); });

render();
tickPill();

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
