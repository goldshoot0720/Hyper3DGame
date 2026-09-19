/** 極簡 WebAudio 音效：引擎用振盪器，其他用短包絡，不需要音檔。 */
export class Audio {
  constructor() {
    this.ctx = null;
    this.engine = null;
    this.enabled = true;
  }

  /** 必須由使用者手勢觸發（瀏覽器自動播放政策）。 */
  resume() {
    if (!this.ctx) {
      const AC = window.AudioContext ?? window.webkitAudioContext;
      if (!AC) { this.enabled = false; return; }
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.5;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  startEngine() {
    if (!this.ctx || this.engine) return;
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    const sub = ctx.createOscillator();
    const gain = ctx.createGain();
    const filter = ctx.createBiquadFilter();
    osc.type = 'sawtooth';
    sub.type = 'square';
    filter.type = 'lowpass';
    filter.frequency.value = 900;
    gain.gain.value = 0.0;
    osc.connect(filter);
    sub.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    osc.start();
    sub.start();
    this.engine = { osc, sub, gain, filter };
  }

  stopEngine() {
    if (!this.engine) return;
    this.engine.osc.stop();
    this.engine.sub.stop();
    this.engine = null;
  }

  /** @param {number} ratio 0~1.4 的速度比例 */
  updateEngine(ratio, boosting) {
    if (!this.engine) return;
    const t = this.ctx.currentTime;
    const f = 55 + ratio * 150;
    this.engine.osc.frequency.setTargetAtTime(f, t, 0.05);
    this.engine.sub.frequency.setTargetAtTime(f * 0.5, t, 0.05);
    this.engine.filter.frequency.setTargetAtTime(600 + ratio * 2200 + (boosting ? 900 : 0), t, 0.08);
    this.engine.gain.gain.setTargetAtTime(0.045 + ratio * 0.075, t, 0.1);
  }

  _blip({ freq = 440, dur = 0.12, type = 'sine', vol = 0.25, sweep = 0 }) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (sweep) osc.frequency.exponentialRampToValueAtTime(Math.max(40, freq + sweep), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g);
    g.connect(this.master);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  beep(freq) { this._blip({ freq, dur: 0.18, type: 'square', vol: 0.22 }); }
  boost() { this._blip({ freq: 260, dur: 0.35, type: 'sawtooth', vol: 0.2, sweep: 700 }); }
  thud() { this._blip({ freq: 150, dur: 0.16, type: 'square', vol: 0.3, sweep: -110 }); }
}
