/**
 * All audio is synthesized at runtime with the Web Audio API, so the game
 * ships zero audio files and zero copyrighted material.
 *
 * Sounds: punch whoosh, hit thud, KO sting, countdown beeps.
 * Music: a small original 8-step boxing-gym groove on a loop scheduler.
 */
class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private musicGain: GainNode | null = null;
  private musicTimer: number | null = null;
  private musicStep = 0;

  volume = Number(localStorage.getItem('fightcam.volume') ?? '0.7');
  muted = localStorage.getItem('fightcam.muted') === '1';

  /** Must be called from a user gesture (browser autoplay policy). */
  unlock(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    this.ctx = new Ctor();
    this.master = this.ctx.createGain();
    this.master.connect(this.ctx.destination);
    this.applyVolume();
  }

  setVolume(v: number): void {
    this.volume = Math.min(1, Math.max(0, v));
    localStorage.setItem('fightcam.volume', String(this.volume));
    this.applyVolume();
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    localStorage.setItem('fightcam.muted', muted ? '1' : '0');
    this.applyVolume();
  }

  private applyVolume(): void {
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(this.muted ? 0 : this.volume, this.ctx.currentTime, 0.02);
    }
  }

  /* ------------------------------ SFX ------------------------------- */

  punchWhoosh(): void {
    if (!this.ready()) return;
    const ctx = this.ctx!;
    const t = ctx.currentTime;
    const noise = this.noiseSource(0.16);
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(1200, t);
    filter.frequency.exponentialRampToValueAtTime(300, t + 0.14);
    filter.Q.value = 1.2;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.5, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
    noise.connect(filter).connect(gain).connect(this.master!);
    noise.start(t);
  }

  hitThud(): void {
    if (!this.ready()) return;
    const ctx = this.ctx!;
    const t = ctx.currentTime;

    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(160, t);
    osc.frequency.exponentialRampToValueAtTime(55, t + 0.18);
    const oscGain = ctx.createGain();
    oscGain.gain.setValueAtTime(0.9, t);
    oscGain.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
    osc.connect(oscGain).connect(this.master!);
    osc.start(t);
    osc.stop(t + 0.22);

    const noise = this.noiseSource(0.06);
    const nGain = ctx.createGain();
    nGain.gain.setValueAtTime(0.35, t);
    nGain.gain.exponentialRampToValueAtTime(0.001, t + 0.06);
    noise.connect(nGain).connect(this.master!);
    noise.start(t);
  }

  koSting(): void {
    if (!this.ready()) return;
    const ctx = this.ctx!;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(420, t);
    osc.frequency.exponentialRampToValueAtTime(70, t + 0.6);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.4, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.65);
    osc.connect(gain).connect(this.master!);
    osc.start(t);
    osc.stop(t + 0.7);
    setTimeout(() => this.hitThud(), 520);
  }

  countdownBeep(final = false): void {
    if (!this.ready()) return;
    const ctx = this.ctx!;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = 'square';
    osc.frequency.value = final ? 1320 : 880;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.18, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + (final ? 0.4 : 0.14));
    osc.connect(gain).connect(this.master!);
    osc.start(t);
    osc.stop(t + (final ? 0.42 : 0.16));
  }

  /* ----------------------------- Music ------------------------------ */

  startMusic(): void {
    if (!this.ready() || this.musicTimer !== null) return;
    const ctx = this.ctx!;
    this.musicGain = ctx.createGain();
    this.musicGain.gain.value = 0.16;
    this.musicGain.connect(this.master!);
    this.musicStep = 0;

    const bassNotes = [55, 55, 65.4, 55, 49, 49, 65.4, 73.4]; // A1-centric original riff
    const stepMs = 60_000 / 104 / 2; // 104 BPM, eighth notes

    this.musicTimer = window.setInterval(() => {
      if (!this.ctx || !this.musicGain) return;
      const t = this.ctx.currentTime;
      const step = this.musicStep % 8;

      // Bass pulse
      const bass = this.ctx.createOscillator();
      bass.type = 'triangle';
      bass.frequency.value = bassNotes[step];
      const bGain = this.ctx.createGain();
      bGain.gain.setValueAtTime(0.5, t);
      bGain.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
      bass.connect(bGain).connect(this.musicGain);
      bass.start(t);
      bass.stop(t + 0.24);

      // Hi-hat tick on every other step
      if (step % 2 === 0) {
        const hat = this.noiseSource(0.04);
        const hp = this.ctx.createBiquadFilter();
        hp.type = 'highpass';
        hp.frequency.value = 6000;
        const hGain = this.ctx.createGain();
        hGain.gain.setValueAtTime(0.12, t);
        hGain.gain.exponentialRampToValueAtTime(0.001, t + 0.04);
        hat.connect(hp).connect(hGain).connect(this.musicGain);
        hat.start(t);
      }
      this.musicStep++;
    }, stepMs);
  }

  stopMusic(): void {
    if (this.musicTimer !== null) {
      clearInterval(this.musicTimer);
      this.musicTimer = null;
    }
    this.musicGain?.disconnect();
    this.musicGain = null;
  }

  /* ---------------------------- Helpers ----------------------------- */

  private ready(): boolean {
    return Boolean(this.ctx && this.master);
  }

  private noiseSource(seconds: number): AudioBufferSourceNode {
    const ctx = this.ctx!;
    const buffer = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * seconds), ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    return src;
  }
}

export const audio = new AudioEngine();
