// 브라우저는 사용자 제스처 없이 소리를 막으므로, 첫 탭에서 오디오를 깨워 둔다.
let audio: AudioContext | null = null;

export function unlockAudio() {
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    audio ||= new Ctx();
    if (audio.state === 'suspended') void audio.resume();
  } catch { /* 소리 없이 진행 */ }
}

export function beep() {
  try {
    unlockAudio();
    const ctx = audio!;
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
