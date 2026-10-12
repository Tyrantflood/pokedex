/**
 * Plays the chiptune in music-data.ts through the Web Audio API: pulse waves (built from their Fourier series, so the duty cycle
 * is real), a triangle bass, and noise for the drums (the kick is a pitch-dropping triangle). Nothing is a recording.
 *
 * Scheduling: a short timer keeps notes queued about 150 ms ahead on the audio clock (`tick`), so the music stays in time however
 * busy the page is. Pausing suspends the context, which freezes the clock and with it the scheduler.
 *
 * The browser blocks audio until the page has been interacted with. `start()` is called from battle code that runs after a
 * click; if the context still comes up suspended, the next pointer/key press resumes it.
 */
import { midiToHz, STEPS_PER_BAR, THEMES, VICTORY, DEFEAT, type DrumKind, type Jingle, type Section, type ThemeMode, type Track } from "./music-data";

const LOOKAHEAD_S = 0.15;
const TICK_MS = 25;
/** Music sits well under the cries: full volume on the slider is still only this much of full scale. */
const BASE_GAIN = 0.5;
const DUCKED_GAIN = 0.35;

type Cursor = {
  kind: "intro" | "loop" | "jingle";
  mode: ThemeMode;
  section: Section;
  stepSeconds: number;
  step: number;
  /** Audio-clock time of `step`. */
  time: number;
};

export interface MusicOptions {
  /** For tests: a stand-in for AudioContext. */
  createContext?: () => AudioContext;
  /** Tests drive `tick()` themselves. */
  autoTick?: boolean;
}

export class MusicPlayer {
  private ctx: AudioContext | null = null;
  private music: GainNode | null = null;
  private duckNode: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private cursor: Cursor | null = null;
  private mode: ThemeMode = "normal";
  private volume = 0.5;
  private started = false;
  private disposed = false;
  private unlockHandler: (() => void) | null = null;
  private readonly waves = new Map<number, PeriodicWave>();
  private readonly index = new WeakMap<Section, { notes: Map<number, { track: Track; length: number; midi: number }[]>; drums: Map<number, DrumKind[]> }>();
  private readonly options: MusicOptions;

  constructor(options: MusicOptions = {}) {
    this.options = options;
  }

  /** Begins the theme (intro, then loop) once; later calls only make sure the context is running. Resolves false if audio is unavailable. */
  async start(): Promise<boolean> {
    if (this.disposed) return false;
    if (!this.ctx && !this.create()) return false;
    const ctx = this.ctx!;
    void ctx.resume().catch(() => {});
    this.listenForUnlock();
    if (!this.started) {
      this.started = true;
      const theme = THEMES[this.mode];
      const now = ctx.currentTime + 0.08;
      this.cursor = theme.intro
        ? { kind: "intro", mode: this.mode, section: theme.intro, stepSeconds: theme.stepSeconds, step: 0, time: now }
        : { kind: "loop", mode: this.mode, section: theme.loop, stepSeconds: theme.stepSeconds, step: 0, time: now };
      this.tick();
      if (this.options.autoTick !== false) this.timer = setInterval(() => this.tick(), TICK_MS);
    }
    return true;
  }

  private create(): boolean {
    try {
      const ctx = this.options.createContext ? this.options.createContext() : new AudioContext();
      this.ctx = ctx;
      this.duckNode = ctx.createGain();
      this.duckNode.connect(ctx.destination);
      this.music = ctx.createGain();
      this.music.connect(this.duckNode);
      this.music.gain.value = this.gainFor(this.volume);
      return true;
    } catch {
      return false;
    }
  }

  private gainFor(volume: number) {
    return BASE_GAIN * volume * volume;
  }

  /** 0 to 1, on a squared curve so the lower half of the slider is usable. */
  setVolume(volume: number) {
    this.volume = Math.max(0, Math.min(1, volume));
    if (this.ctx && this.music) this.music.gain.setTargetAtTime(this.gainFor(this.volume), this.ctx.currentTime, 0.03);
  }

  /** The switch happens at the next bar line, in the same place in the loop, so the song carries on rather than restarting. */
  setMode(mode: ThemeMode) {
    this.mode = mode;
  }

  setPaused(paused: boolean) {
    const ctx = this.ctx;
    if (!ctx || this.disposed) return;
    if (paused) void ctx.suspend().catch(() => {});
    else void ctx.resume().catch(() => {});
  }

  /** Lowers the music while something else (a cry) is playing, and brings it back slowly afterwards. */
  duck(on: boolean) {
    if (!this.ctx || !this.duckNode) return;
    this.duckNode.gain.setTargetAtTime(on ? DUCKED_GAIN : 1, this.ctx.currentTime, on ? 0.04 : 0.35);
  }

  /** Ends the battle theme and plays a short jingle once. */
  playJingle(kind: "win" | "lose") {
    const ctx = this.ctx;
    if (!ctx || !this.started || this.disposed) return;
    const jingle: Jingle = kind === "win" ? VICTORY : DEFEAT;
    this.cursor = { kind: "jingle", mode: this.mode, section: jingle.section, stepSeconds: jingle.stepSeconds, step: 0, time: ctx.currentTime + 0.35 };
    this.tick();
  }

  dispose() {
    this.disposed = true;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.cursor = null;
    if (this.unlockHandler) {
      for (const type of ["pointerdown", "keydown", "touchend"]) window.removeEventListener(type, this.unlockHandler);
      this.unlockHandler = null;
    }
    const ctx = this.ctx;
    this.ctx = null;
    void ctx?.close().catch(() => {});
  }

  private listenForUnlock() {
    if (this.unlockHandler || typeof window === "undefined" || this.ctx?.state === "running") return;
    this.unlockHandler = () => {
      void this.ctx?.resume().catch(() => {});
      if (this.ctx?.state === "running" && this.unlockHandler) {
        for (const type of ["pointerdown", "keydown", "touchend"]) window.removeEventListener(type, this.unlockHandler);
        this.unlockHandler = null;
      }
    };
    for (const type of ["pointerdown", "keydown", "touchend"]) window.addEventListener(type, this.unlockHandler);
  }

  // ---- scheduling ------------------------------------------------------------------------------------------------------

  /** Queues every step that falls in the next `LOOKAHEAD_S` of audio time. */
  tick() {
    const ctx = this.ctx;
    if (!ctx || this.disposed) return;
    while (this.cursor && this.cursor.time < ctx.currentTime + LOOKAHEAD_S) this.scheduleStep(this.cursor);
  }

  private indexOf(section: Section) {
    let index = this.index.get(section);
    if (!index) {
      index = { notes: new Map(), drums: new Map() };
      for (const track of section.tracks) {
        for (const n of track.notes) {
          const list = index.notes.get(n.step) ?? [];
          list.push({ track, length: n.length, midi: n.midi });
          index.notes.set(n.step, list);
        }
      }
      for (const d of section.drums) index.drums.set(d.step, [...(index.drums.get(d.step) ?? []), d.kind]);
      this.index.set(section, index);
    }
    return index;
  }

  private scheduleStep(cursor: Cursor) {
    // A pending change of intensity takes effect on a bar line, at the same position in the loop.
    if (cursor.kind === "loop" && cursor.step % STEPS_PER_BAR === 0 && cursor.mode !== this.mode) {
      const theme = THEMES[this.mode];
      cursor.mode = this.mode;
      cursor.section = theme.loop;
      cursor.stepSeconds = theme.stepSeconds;
    }
    const index = this.indexOf(cursor.section);
    for (const n of index.notes.get(cursor.step) ?? []) this.playNote(n.track, n.midi, cursor.time, n.length * cursor.stepSeconds);
    for (const kind of index.drums.get(cursor.step) ?? []) this.playDrum(kind, cursor.time);

    cursor.step += 1;
    cursor.time += cursor.stepSeconds;
    if (cursor.step >= cursor.section.steps) {
      if (cursor.kind === "jingle") {
        this.cursor = null;
        return;
      }
      cursor.kind = "loop";
      const theme = THEMES[this.mode];
      cursor.mode = this.mode;
      cursor.section = theme.loop;
      cursor.stepSeconds = theme.stepSeconds;
      cursor.step = 0;
    }
  }

  // ---- voices ----------------------------------------------------------------------------------------------------------

  private pulse(duty: number): PeriodicWave {
    let wave = this.waves.get(duty);
    if (!wave) {
      // Fourier series of a pulse wave of the given duty: a_n = sin(2*pi*n*d) / (pi*n), b_n = (1 - cos(2*pi*n*d)) / (pi*n).
      const harmonics = 48;
      const real = new Float32Array(harmonics + 1);
      const imag = new Float32Array(harmonics + 1);
      for (let n = 1; n <= harmonics; n++) {
        real[n] = Math.sin(2 * Math.PI * n * duty) / (Math.PI * n);
        imag[n] = (1 - Math.cos(2 * Math.PI * n * duty)) / (Math.PI * n);
      }
      wave = this.ctx!.createPeriodicWave(real, imag);
      this.waves.set(duty, wave);
    }
    return wave;
  }

  private playNote(track: Track, midi: number, time: number, duration: number) {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    if (track.wave === "pulse") osc.setPeriodicWave(this.pulse(track.duty));
    else osc.type = "triangle";
    osc.frequency.value = midiToHz(midi);
    const gain = ctx.createGain();
    const peak = track.gain;
    const end = time + Math.max(0.03, duration);
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.linearRampToValueAtTime(peak, time + 0.006);
    // Plucked: pulse notes decay to two thirds of their level over the note, the triangle holds.
    gain.gain.linearRampToValueAtTime(track.wave === "pulse" ? peak * 0.65 : peak * 0.92, end - 0.012);
    gain.gain.linearRampToValueAtTime(0.0001, end);
    osc.connect(gain);
    gain.connect(this.music!);
    osc.start(time);
    osc.stop(end + 0.01);
  }

  private noiseBuffer(): AudioBuffer {
    if (!this.noise) {
      const ctx = this.ctx!;
      const buffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      this.noise = buffer;
    }
    return this.noise;
  }

  private playDrum(kind: DrumKind, time: number) {
    const ctx = this.ctx!;
    const out = this.music!;
    if (kind === "kick") {
      const osc = ctx.createOscillator();
      osc.type = "triangle";
      osc.frequency.setValueAtTime(170, time);
      osc.frequency.exponentialRampToValueAtTime(45, time + 0.1);
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.8, time);
      gain.gain.exponentialRampToValueAtTime(0.001, time + 0.14);
      osc.connect(gain);
      gain.connect(out);
      osc.start(time);
      osc.stop(time + 0.16);
      return;
    }
    const source = ctx.createBufferSource();
    source.buffer = this.noiseBuffer();
    const filter = ctx.createBiquadFilter();
    const gain = ctx.createGain();
    const length = kind === "snare" ? 0.12 : 0.04;
    filter.type = kind === "snare" ? "bandpass" : "highpass";
    filter.frequency.value = kind === "snare" ? 1800 : 7000;
    filter.Q.value = 0.8;
    gain.gain.setValueAtTime(kind === "snare" ? 0.5 : 0.16, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + length);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(out);
    source.start(time, Math.random() * 0.5);
    source.stop(time + length + 0.02);
  }
}
