import { MODULES } from './store.js';

export function h(tag, props, ...children) {
  const el = document.createElement(tag);
  if (props == null || typeof props !== 'object' || props instanceof Node || Array.isArray(props)) {
    children.unshift(props);
    props = {};
  }
  for (const [k, v] of Object.entries(props)) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'value') el.value = v;
    else if (k === 'checked') el.checked = !!v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat(Infinity)) {
    if (c == null || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

const ICONS = {
  today: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  focus: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
  inbox: '<path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/>',
  think: '<path d="M9 18h6M10 22h4"/><path d="M12 2a7 7 0 0 0-4 12.7c.6.5 1 1.3 1 2.1V17h6v-.2c0-.8.4-1.6 1-2.1A7 7 0 0 0 12 2z"/>',
  rhythm: '<path d="M22 12h-4l-3 9L9 3l-3 9H2"/>',
  manual: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>',
  review: '<path d="M21 12a9 9 0 1 1-3-6.7L21 8"/><path d="M21 3v5h-5"/>',
  settings: '<path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  up: '<path d="M7 17 17 7M8 7h9v9"/>',
};

export function icon(name, size = 22) {
  const span = document.createElement('span');
  span.className = 'ico';
  span.innerHTML = `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ''}</svg>`;
  return span;
}

export function screenHeader(id, title) {
  const m = MODULES.find((x) => x.id === id);
  return h('header', { class: 'screen-head' },
    h('div', { class: 'layer' }, m.layer),
    h('h1', {}, title || m.name),
    h('p', { class: 'muted' }, m.desc));
}

export function card({ title, sub, tag, cls = '' } = {}, ...children) {
  return h('section', { class: `card ${cls}` },
    (title || tag) && h('div', { class: 'card-head' }, title && h('h2', {}, title), tag && h('span', { class: 'tag' }, tag)),
    sub && h('p', { class: 'sub' }, sub),
    ...children);
}

const isEnter = (e) => e.key === 'Enter' && !e.isComposing && e.keyCode !== 229;

export function textarea({ value = '', placeholder = '', rows = 1, onInput, onEnter, cls = '', fk, label } = {}) {
  const el = h('textarea', { class: `field ${cls}`, rows, placeholder, 'data-fk': fk, 'aria-label': label || placeholder });
  el.value = value ?? '';
  const fit = () => {
    el.style.height = 'auto';
    el.style.height = el.scrollHeight + 2 + 'px';
  };
  el.addEventListener('input', () => {
    fit();
    onInput && onInput(el.value);
  });
  if (onEnter) el.addEventListener('keydown', (e) => {
    if (isEnter(e) && !e.shiftKey) {
      e.preventDefault();
      onEnter(el.value, el);
    }
  });
  requestAnimationFrame(fit);
  return el;
}

export function input({ value = '', placeholder = '', type = 'text', onInput, onEnter, cls = '', fk, label, attrs = {} } = {}) {
  const el = h('input', { type, class: `field ${cls}`, placeholder, 'data-fk': fk, 'aria-label': label || placeholder, ...attrs });
  el.value = value ?? '';
  if (onInput) el.addEventListener('input', () => onInput(el.value));
  if (onEnter) el.addEventListener('keydown', (e) => {
    if (isEnter(e)) {
      e.preventDefault();
      onEnter(el.value, el);
    }
  });
  return el;
}

export function field(label, control, hint) {
  return h('label', { class: 'fieldset' }, h('span', { class: 'label' }, label), control, hint && h('span', { class: 'hint' }, hint));
}

export function btn(label, onClick, cls = '', attrs = {}) {
  return h('button', { type: 'button', class: `btn ${cls}`, onClick, ...attrs }, label);
}

export function iconBtn(name, label, onClick, cls = '') {
  return h('button', { type: 'button', class: `icon-btn ${cls}`, 'aria-label': label, title: label, onClick }, icon(name, 18));
}

export function chips(options, value, onPick, cls = '') {
  return h('div', { class: `chips ${cls}`, role: 'group' },
    options.map((o) => {
      const opt = typeof o === 'object' ? o : { value: o, label: String(o) };
      return h('button', {
        type: 'button',
        class: `chip ${opt.value === value ? 'on' : ''} ${opt.cls || ''}`,
        'aria-pressed': opt.value === value ? 'true' : 'false',
        onClick: () => onPick(opt.value),
      }, opt.label);
    }));
}

export const empty = (text) => h('p', { class: 'empty' }, text);

// 다시 그린 뒤 포커스를 돌려줄 입력창 (data-fk)
export const focusNext = { key: null };

let toastTimer;
export function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
}

export function fmtClock(ms) {
  const neg = ms < 0;
  const t = Math.floor(Math.abs(ms) / 1000);
  const m = Math.floor(t / 60);
  const s = t % 60;
  return `${neg ? '+' : ''}${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function timeAgo(ts) {
  const d = (Date.now() - ts) / 1000;
  if (d < 60) return '방금';
  if (d < 3600) return `${Math.floor(d / 60)}분 전`;
  if (d < 86400) return `${Math.floor(d / 3600)}시간 전`;
  if (d < 86400 * 7) return `${Math.floor(d / 86400)}일 전`;
  return fmtDate(ts);
}

export function fmtDate(ts) {
  const d = new Date(ts);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

// 브라우저는 사용자 제스처 없이 소리를 막으므로, 첫 탭에서 오디오를 깨워 둔다.
let audio = null;
export function unlockAudio() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    audio ||= new Ctx();
    if (audio.state === 'suspended') audio.resume();
  } catch { /* 소리 없이 진행 */ }
}

export function beep() {
  try {
    unlockAudio();
    const ctx = audio;
    [0, 0.25, 0.5].forEach((t) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.value = 660;
      g.gain.setValueAtTime(0.0001, ctx.currentTime + t);
      g.gain.exponentialRampToValueAtTime(0.2, ctx.currentTime + t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + t + 0.2);
      o.connect(g).connect(ctx.destination);
      o.start(ctx.currentTime + t);
      o.stop(ctx.currentTime + t + 0.22);
    });
    navigator.vibrate?.([120, 80, 120]);
  } catch { /* 소리 없이 진행 */ }
}
