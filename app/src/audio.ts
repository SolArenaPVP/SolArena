/** All sound is synthesized at runtime with WebAudio, so the game ships with no audio files. */

export type Sfx =
  | 'light' | 'heavy' | 'block' | 'whoosh' | 'jump' | 'land' | 'dash' | 'ko' | 'throw' | 'super'
  | 'yap' | 'candle' | 'pounce' | 'slap' | 'salt' | 'ice' | 'eye' | 'zap' | 'counter'
  | 'menuMove' | 'menuConfirm' | 'menuBack' | 'select';

export interface AudioSettings {
  sfx: boolean;
  music: boolean;
  voice: boolean;
}

class AudioEngine {
  ctx: AudioContext | null = null;
  private master!: GainNode;
  private sfxBus!: GainNode;
  private musicBus!: GainNode;
  private noiseBuf!: AudioBuffer;
  settings: AudioSettings = { sfx: true, music: true, voice: true };
  private track: 'menu' | 'fight' | null = null;
  private nextStep = 0;
  private step = 0;
  private timer: number | null = null;

  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    const ctx = new AudioContext();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = 0.7;
    this.master.connect(ctx.destination);
    this.sfxBus = ctx.createGain();
    this.sfxBus.connect(this.master);
    this.musicBus = ctx.createGain();
    this.musicBus.gain.value = this.settings.music ? 0.22 : 0;
    this.musicBus.connect(this.master);
    this.noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    if (this.track) this.startScheduler();
  }

  setMusic(on: boolean) {
    this.settings.music = on;
    if (this.ctx) this.musicBus.gain.setTargetAtTime(on ? 0.22 : 0, this.ctx.currentTime, 0.05);
  }

  // ---- primitives -------------------------------------------------------

  private tone(type: OscillatorType, f0: number, f1: number, dur: number, vol: number, at = 0, bus?: GainNode) {
    const ctx = this.ctx!;
    const t = ctx.currentTime + at;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(bus ?? this.sfxBus);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  private noise(filter: BiquadFilterType, f0: number, f1: number, dur: number, vol: number, at = 0, q = 1, bus?: GainNode) {
    const ctx = this.ctx!;
    const t = ctx.currentTime + at;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const flt = ctx.createBiquadFilter();
    flt.type = filter;
    flt.Q.value = q;
    flt.frequency.setValueAtTime(f0, t);
    flt.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(flt).connect(g).connect(bus ?? this.sfxBus);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.02);
  }

  play(name: Sfx) {
    if (!this.ctx || !this.settings.sfx) return;
    switch (name) {
      case 'light':
        this.noise('bandpass', 2400, 900, 0.07, 0.5, 0, 1.2);
        this.tone('sine', 220, 70, 0.09, 0.6);
        break;
      case 'heavy':
        this.noise('lowpass', 3000, 300, 0.18, 0.7);
        this.tone('sine', 140, 38, 0.22, 0.9);
        this.tone('square', 90, 40, 0.08, 0.15);
        break;
      case 'block':
        this.tone('square', 1300, 900, 0.04, 0.18);
        this.noise('highpass', 4000, 2500, 0.05, 0.3);
        break;
      case 'whoosh':
        this.noise('bandpass', 500, 1800, 0.11, 0.18, 0, 2);
        break;
      case 'jump':
        this.tone('square', 260, 520, 0.08, 0.06);
        break;
      case 'land':
        this.tone('sine', 110, 50, 0.07, 0.25);
        break;
      case 'dash':
        this.noise('bandpass', 900, 300, 0.15, 0.25, 0, 1.5);
        break;
      case 'throw':
        this.noise('lowpass', 1200, 200, 0.3, 0.6);
        this.tone('sine', 100, 30, 0.35, 0.9, 0.05);
        break;
      case 'ko':
        this.tone('sine', 90, 25, 1.1, 1.0);
        this.noise('lowpass', 2500, 80, 1.0, 0.8);
        this.tone('sawtooth', 220, 55, 0.6, 0.15, 0.05);
        break;
      case 'super':
        this.tone('sawtooth', 120, 1200, 0.5, 0.18);
        this.tone('square', 240, 2400, 0.5, 0.08);
        this.noise('highpass', 800, 6000, 0.6, 0.25);
        break;
      case 'yap':
        for (let i = 0; i < 4; i++) this.tone('square', 600 + i * 90, 900 + i * 60, 0.05, 0.1, i * 0.05);
        break;
      case 'candle':
        this.tone('sawtooth', 160, 900, 0.3, 0.16);
        this.noise('bandpass', 400, 2400, 0.3, 0.2, 0, 3);
        break;
      case 'pounce':
        this.tone('triangle', 700, 1300, 0.08, 0.25);
        this.tone('triangle', 1300, 600, 0.12, 0.2, 0.08);
        break;
      case 'slap':
        this.noise('highpass', 6000, 1500, 0.12, 0.9);
        this.tone('sine', 160, 40, 0.3, 1.0);
        break;
      case 'salt':
        for (let i = 0; i < 6; i++) this.noise('highpass', 7000, 5000, 0.03, 0.25, i * 0.03);
        break;
      case 'ice':
        this.tone('triangle', 1800, 2600, 0.25, 0.12);
        this.tone('triangle', 2400, 1400, 0.3, 0.1, 0.05);
        this.noise('highpass', 5000, 9000, 0.2, 0.2);
        break;
      case 'eye':
        this.tone('sine', 220, 220, 0.5, 0.25);
        this.tone('sine', 1320, 1320, 0.6, 0.12, 0.05);
        this.tone('sine', 1980, 1980, 0.5, 0.06, 0.1);
        break;
      case 'counter':
        this.tone('sine', 1760, 880, 0.25, 0.25);
        this.noise('lowpass', 3000, 300, 0.2, 0.6);
        break;
      case 'zap':
        this.tone('sawtooth', 2400, 200, 0.18, 0.18);
        this.noise('bandpass', 3000, 6000, 0.15, 0.35, 0, 2);
        break;
      case 'menuMove':
        this.tone('square', 660, 660, 0.035, 0.08);
        break;
      case 'menuConfirm':
        this.tone('square', 660, 660, 0.05, 0.1);
        this.tone('square', 990, 990, 0.08, 0.1, 0.05);
        break;
      case 'menuBack':
        this.tone('square', 440, 330, 0.08, 0.1);
        break;
      case 'select':
        this.tone('square', 523, 523, 0.06, 0.1);
        this.tone('square', 784, 784, 0.06, 0.1, 0.06);
        this.tone('square', 1046, 1046, 0.12, 0.1, 0.12);
        break;
    }
  }

  // ---- announcer --------------------------------------------------------

  announce(text: string) {
    if (!this.settings.voice || !('speechSynthesis' in window)) return;
    const synth = window.speechSynthesis;
    synth.cancel();
    const u = new SpeechSynthesisUtterance(text);
    const voices = synth.getVoices();
    const pick = voices.find((v) => /david|daniel|guy|male/i.test(v.name) && v.lang.startsWith('en'))
      ?? voices.find((v) => v.lang.startsWith('en'));
    if (pick) u.voice = pick;
    u.rate = 0.95;
    u.pitch = 0.55;
    u.volume = 1;
    synth.speak(u);
  }

  // ---- music: a tiny step sequencer -------------------------------------

  playTrack(track: 'menu' | 'fight' | null) {
    if (track === this.track) return;
    this.track = track;
    this.step = 0;
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
    if (track && this.ctx) this.startScheduler();
  }

  private startScheduler() {
    if (this.timer !== null) clearInterval(this.timer);
    this.nextStep = this.ctx!.currentTime + 0.05;
    this.timer = window.setInterval(() => this.schedule(), 25);
  }

  private schedule() {
    const ctx = this.ctx;
    if (!ctx || !this.track) return;
    const bpm = this.track === 'fight' ? 150 : 104;
    const stepDur = 60 / bpm / 4;
    while (this.nextStep < ctx.currentTime + 0.12) {
      this.playStep(this.step, this.nextStep - ctx.currentTime, stepDur);
      this.nextStep += stepDur;
      this.step = (this.step + 1) % 128;
    }
  }

  private playStep(step: number, at: number, dur: number) {
    const bus = this.musicBus;
    const bar = Math.floor(step / 16) % 8;
    const s = step % 16;
    // i - VI - III - VII in A minor, the classic arcade-boss progression
    const roots = [45, 41, 48, 43, 45, 41, 48, 44];
    const root = roots[bar];
    const midi = (n: number) => 440 * Math.pow(2, (n - 69) / 12);
    if (this.track === 'fight') {
      if (s % 4 === 0) this.tone('sine', 150, 40, 0.12, 0.9, at, bus);
      if (s === 4 || s === 12) this.noise('bandpass', 1800, 900, 0.1, 0.5, at, 0.8, bus);
      if (s % 2 === 1) this.noise('highpass', 8000, 7000, 0.03, 0.18, at, 1, bus);
      const bassPattern = [0, 0, 12, 0, 0, 12, 0, 10, 0, 0, 12, 0, 7, 0, 10, 12];
      this.tone('sawtooth', midi(root - 12 + bassPattern[s]), midi(root - 12 + bassPattern[s]), dur * 0.9, 0.22, at, bus);
      const arp = [0, 3, 7, 12, 7, 3, 0, 3, 7, 12, 15, 12, 7, 3, 7, 12];
      if (bar >= 2) this.tone('square', midi(root + 12 + arp[s]), midi(root + 12 + arp[s]), dur * 0.6, 0.06, at, bus);
      const lead = [24, -1, 22, -1, 19, -1, 22, 24, -1, 27, -1, 24, 22, -1, 19, -1];
      if (bar >= 4 && lead[s] >= 0) this.tone('square', midi(root + lead[s]), midi(root + lead[s]), dur * 1.6, 0.07, at, bus);
    } else {
      if (s % 8 === 0) this.tone('sine', 120, 40, 0.15, 0.6, at, bus);
      if (s === 8) this.noise('bandpass', 1500, 700, 0.12, 0.25, at, 0.8, bus);
      if (s % 4 === 2) this.noise('highpass', 8000, 7000, 0.03, 0.1, at, 1, bus);
      if (s % 4 === 0) this.tone('triangle', midi(root - 12), midi(root - 12), dur * 3.5, 0.3, at, bus);
      const arp = [0, 7, 12, 15, 19, 15, 12, 7];
      if (s % 2 === 0) this.tone('square', midi(root + 12 + arp[(s / 2) % 8]), midi(root + 12 + arp[(s / 2) % 8]), dur * 1.5, 0.045, at, bus);
    }
  }
}

export const audio = new AudioEngine();
