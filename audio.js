// Zero-dependency procedural Web Audio SFX engine for Gothic Crypt FPS.
// Synthesizes crisp gunshots, metallic headshot dings, hitmarkers, reloads & footsteps.

export function createAudio() {
  let ctx = null;
  let muted = false;
  let volume = .55;

  function ensure() {
    if (muted) return null;
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
    }
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    return ctx;
  }

  function noiseBurst(c, duration, filterFreq, gainVal, q = 1, start = 0) {
    const len = Math.max(1, Math.floor(c.sampleRate * duration));
    const buf = c.createBuffer(1, len, c.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (len * .28));
    const src = c.createBufferSource();
    src.buffer = buf;
    const filt = c.createBiquadFilter();
    filt.type = 'bandpass';
    filt.frequency.value = filterFreq;
    filt.Q.value = q;
    const g = c.createGain();
    g.gain.setValueAtTime(gainVal * volume, c.currentTime + start);
    g.gain.exponentialRampToValueAtTime(.001, c.currentTime + start + duration);
    src.connect(filt).connect(g).connect(c.destination);
    src.start(c.currentTime + start);
  }

  function tone(c, type, f0, f1, dur, gainVal, start = 0) {
    const osc = c.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(f0, c.currentTime + start);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, f1), c.currentTime + start + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(gainVal * volume, c.currentTime + start);
    g.gain.exponentialRampToValueAtTime(.001, c.currentTime + start + dur);
    osc.connect(g).connect(c.destination);
    osc.start(c.currentTime + start);
    osc.stop(c.currentTime + start + dur + .02);
  }

  return {
    unlock: ensure,
    setMuted(m) { muted = Boolean(m); },
    get muted() { return muted; },
    setVolume(v) { volume = Math.max(0, Math.min(1, v)); },
    shot(kind = 'rifle', dist = 0) {
      const c = ensure();
      if (!c) return;
      const att = dist > 0 ? Math.max(.06, 1 / (1 + dist * .065)) : 1;
      if (kind === 'sniper') {
        noiseBurst(c, .26, 950, .55 * att, .65);
        tone(c, 'sawtooth', 165, 34, .22, .42 * att);
      } else if (kind === 'smg') {
        noiseBurst(c, .09, 2100, .28 * att, 1.1);
        tone(c, 'triangle', 260, 75, .07, .22 * att);
      } else {
        noiseBurst(c, .15, 1350, .38 * att, .85);
        tone(c, 'sawtooth', 190, 48, .11, .28 * att);
      }
    },
    hit(headshot = false) {
      const c = ensure();
      if (!c) return;
      if (headshot) {
        tone(c, 'sine', 1680, 1320, .14, .34);
        tone(c, 'triangle', 2520, 2100, .11, .20, .02);
      } else {
        tone(c, 'triangle', 920, 480, .055, .24);
      }
    },
    kill() {
      const c = ensure();
      if (!c) return;
      tone(c, 'sine', 660, 880, .09, .24);
      tone(c, 'sine', 990, 1320, .16, .22, .07);
    },
    reload() {
      const c = ensure();
      if (!c) return;
      tone(c, 'square', 420, 220, .05, .14, 0);
      tone(c, 'square', 520, 780, .06, .16, .35);
    },
    step(land = false) {
      const c = ensure();
      if (!c) return;
      noiseBurst(c, land ? .11 : .055, land ? 320 : 520, land ? .24 : .10, 1.4);
    },
    damage() {
      const c = ensure();
      if (!c) return;
      tone(c, 'sawtooth', 140, 52, .14, .32);
    },
    matchEnd(win) {
      const c = ensure();
      if (!c) return;
      const notes = win ? [440, 554, 659, 880] : [392, 349, 311, 261];
      notes.forEach((f, i) => tone(c, 'triangle', f, f, .26, .22, i * .11));
    }
  };
}
