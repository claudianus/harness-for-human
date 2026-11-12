// 캘린더 파일(.ics) 만들기.
// 서버 없는 웹 앱은 닫혀 있으면 울릴 수 없다. 휴대폰 캘린더는 앱이 닫혀 있어도 울린다.
// 그래서 "꼭 울려야 하는 것"은 캘린더에 맡긴다. (RFC 5545)
import type { Anchor, Item } from '../store/model';

const pad = (n: number) => String(n).padStart(2, '0');
// 기기 시간대 그대로 (떠 있는 시각): 어느 캘린더에서든 그 지역 시각으로 울린다
const local = (d: Date) => `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}T${pad(d.getHours())}${pad(d.getMinutes())}00`;
const utc = (d: Date) => `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
export const escapeText = (t: string) => t.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');

// 한 줄은 75바이트까지. 넘으면 다음 줄을 공백으로 시작해 잇는다.
function fold(line: string): string {
  const enc = new TextEncoder();
  const out: string[] = [];
  let cur = '';
  let bytes = 0;
  for (const ch of line) {
    const n = enc.encode(ch).length;
    if (bytes + n > (out.length ? 74 : 75)) { out.push(cur); cur = ''; bytes = 0; }
    cur += ch;
    bytes += n;
  }
  out.push(cur);
  return out.join('\r\n ');
}

function alarm(minutesBefore: number, text: string): string[] {
  return ['BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${escapeText(text)}`, `TRIGGER:${minutesBefore > 0 ? `-PT${minutesBefore}M` : 'PT0M'}`, 'END:VALARM'];
}

function calendar(events: string[][], stamp: number): string {
  const lines = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Human Harness//KO', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    ...events.flatMap((e) => ['BEGIN:VEVENT', `DTSTAMP:${utc(new Date(stamp))}`, ...e, 'END:VEVENT']),
    'END:VCALENDAR',
  ];
  return lines.map(fold).join('\r\n') + '\r\n';
}

// 알림·약속 하나. 이동 시간이 있으면 출발 시각에도 울린다.
export function itemIcs(i: Item, stamp = Date.now()): string {
  const start = new Date(i.due!);
  const end = new Date(i.due! + 30 * 60000);
  const title = i.text || '알림';
  const ev = [`UID:item-${i.id}@human-harness`, `DTSTART:${local(start)}`, `DTEND:${local(end)}`, `SUMMARY:${escapeText(title)}`];
  if (i.travel) ev.push(...alarm(i.travel, `지금 출발하세요: ${title}`));
  ev.push(...alarm(0, title));
  return calendar([ev], stamp);
}

// 매일 반복되는 루틴. UID가 같으므로 다시 가져오면 덮어쓴다 (중복되지 않는다).
export function routinesIcs(anchors: Anchor[], from = new Date(), stamp = Date.now()): string {
  const events = anchors.filter((a) => a.status === 'active').map((a) => {
    const [h, m] = a.time.split(':').map(Number);
    const start = new Date(from.getFullYear(), from.getMonth(), from.getDate(), h, m);
    const title = a.target === 'min' ? a.minimum : a.title;
    return [
      `UID:anchor-${a.id}@human-harness`, `DTSTART:${local(start)}`, `DTEND:${local(new Date(start.getTime() + 10 * 60000))}`,
      'RRULE:FREQ=DAILY', `SUMMARY:${escapeText(title)}`,
      `DESCRIPTION:${escapeText(a.target === 'min' ? '휴먼 하네스' : `힘들면 ${a.minimum}만 해도 됩니다.`)}`,
      ...alarm(0, title),
    ];
  });
  return calendar(events, stamp);
}

export function download(name: string, text: string, type = 'text/calendar') {
  const url = URL.createObjectURL(new Blob([text], { type: `${type};charset=utf-8` }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
