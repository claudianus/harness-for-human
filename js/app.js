import { store, MODULES, runningSession, addCapture } from './store.js';
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
  const s = store.get();
  const r = currentRoute();
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
setInterval(tickPill, 1000);

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
// 자정이 지나면 오늘 화면이 새 날로 바뀌도록
document.addEventListener('visibilitychange', () => { if (!document.hidden && !document.activeElement?.matches('input,textarea')) render(); });

render();
tickPill();

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
