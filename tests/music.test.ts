import assert from "node:assert/strict";
import { test } from "node:test";
import { DEFEAT, isLastStand, midiToHz, noteToMidi, parseLine, STEPS_PER_BAR, THEMES, VICTORY, type Section } from "../lib/battle/music-data";
import { MusicPlayer } from "../lib/battle/music-engine";

test("note names map to MIDI numbers and frequencies", () => {
  assert.equal(noteToMidi("A4"), 69);
  assert.equal(noteToMidi("C4"), 60);
  assert.equal(noteToMidi("F#5"), 78);
  assert.equal(noteToMidi("Bb3"), 58);
  assert.equal(midiToHz(69), 440);
  assert.ok(Math.abs(midiToHz(40) - 82.41) < 0.01, "E2");
  assert.throws(() => noteToMidi("H4"));
  assert.throws(() => parseLine("E5:0"));
  assert.throws(() => parseLine("E5"));
  assert.deepEqual(parseLine("E5:3 r:1 G5:2"), { notes: [{ step: 0, length: 3, midi: 76 }, { step: 4, length: 2, midi: 79 }], steps: 6 });
});

const sections: [string, Section, number][] = [
  ["normal intro", THEMES.normal.intro!, 4 * STEPS_PER_BAR],
  ["normal loop", THEMES.normal.loop, 16 * STEPS_PER_BAR],
  ["intense loop", THEMES.intense.loop, 16 * STEPS_PER_BAR],
  ["victory", VICTORY.section, 3 * STEPS_PER_BAR],
  ["defeat", DEFEAT.section, 2 * STEPS_PER_BAR],
];

for (const [name, section, steps] of sections) {
  test(`${name}: right length, every note and drum inside it, one voice per track at a time, pitches playable`, () => {
    assert.equal(section.steps, steps);
    assert.ok(section.tracks.some((t) => t.wave === "pulse") && section.tracks.some((t) => t.wave === "triangle"), "pulse and triangle channels");
    for (const track of section.tracks) {
      const sorted = [...track.notes].sort((a, b) => a.step - b.step);
      sorted.forEach((n, i) => {
        assert.ok(n.step >= 0 && n.step + n.length <= section.steps, `${track.name} note at ${n.step} runs past the end`);
        assert.ok(n.midi >= 28 && n.midi <= 100, `${track.name} pitch ${n.midi} out of range`);
        const next = sorted[i + 1];
        // Arpeggio and lead voices are monophonic: a note must be over before the next begins.
        if (next && track.name !== "lead-low") assert.ok(n.step + n.length <= next.step, `${track.name} notes overlap at step ${next.step}`);
      });
    }
    for (const d of section.drums) assert.ok(d.step >= 0 && d.step < section.steps);
    assert.ok(section.drums.length > 0 || name === "victory" || name === "defeat" || name === "normal intro");
  });
}

test("the loop resolves: it starts on the tonic, and the intense version is the same song, higher and faster", () => {
  const bassAt = (s: Section, step: number) => s.tracks.find((t) => t.name === "bass")!.notes.find((n) => n.step === step)!.midi;
  assert.equal(bassAt(THEMES.normal.loop, 0), noteToMidi("E2"));
  assert.equal(bassAt(THEMES.intense.loop, 0), noteToMidi("E2") + 2, "a whole tone up");
  assert.ok(THEMES.intense.stepSeconds < THEMES.normal.stepSeconds * 0.95, "faster");
  assert.equal(THEMES.intense.loop.steps, THEMES.normal.loop.steps, "same length, so a switch can keep its place");
  assert.ok(THEMES.intense.loop.tracks.length > THEMES.normal.loop.tracks.length, "an extra voice");
});

test("jingles are short", () => {
  assert.ok(VICTORY.section.steps * VICTORY.stepSeconds < 6);
  assert.ok(DEFEAT.section.steps * DEFEAT.stepSeconds < 6);
  assert.ok(VICTORY.section.steps * VICTORY.stepSeconds > 3);
});

test("the intense music starts only when exactly one Pokémon is left and it is the one on the field", () => {
  const mon = (fainted: boolean) => ({ fainted });
  const team = (flags: boolean[], active: number, teamSize = 6) => ({ mons: flags.map(mon), teamSize, active });
  assert.equal(isLastStand(team([true, true, true, true, true, false], 5)), true);
  assert.equal(isLastStand(team([true, true, true, true, true, false], 4)), false, "the fainted one is still on the field");
  assert.equal(isLastStand(team([true, true, true, false, false, false], 3)), false, "more than one left");
  assert.equal(isLastStand(team([false], 0)), false, "a team of one isn't a last stand");
  assert.equal(isLastStand(team([true, true, true, true, true], 4)), false, "the whole team isn't known yet");
  assert.equal(isLastStand(team([true, true, true, true, true, false], -1)), false);
});

// ---- the player, against a stand-in for the Web Audio API ------------------------------------------------------------------

interface Start {
  time: number;
  hz: number;
  kind: "pulse" | "triangle" | "kick" | "noise";
}

function fakeAudio() {
  const starts: Start[] = [];
  const gains: { setTargets: [number, number, number][] }[] = [];
  const param = (): AudioParam =>
    ({ value: 0, setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {}, setTargetAtTime() {} }) as unknown as AudioParam;
  const ctx = {
    currentTime: 0,
    sampleRate: 1000,
    state: "running",
    destination: {},
    resume: async () => {},
    suspend: async () => {},
    close: async () => {},
    createGain() {
      const node = { gain: param(), connect: () => node, setTargets: [] as [number, number, number][] };
      node.gain.setTargetAtTime = ((v: number, t: number, k: number) => node.setTargets.push([v, t, k])) as never;
      gains.push(node);
      return node;
    },
    createOscillator() {
      const node = {
        frequency: param(),
        type: "square",
        pulse: false,
        setPeriodicWave() {
          node.pulse = true;
        },
        connect: () => node,
        stop() {},
        start(time: number) {
          const hz = (node.frequency as unknown as { value: number }).value;
          starts.push({ time, hz, kind: node.pulse ? "pulse" : hz === 0 ? "kick" : "triangle" });
        },
      };
      return node;
    },
    createBufferSource() {
      const node = { buffer: null, connect: () => node, stop() {}, start(time: number) { starts.push({ time, hz: 0, kind: "noise" }); } };
      return node;
    },
    createBiquadFilter: () => ({ type: "", frequency: { value: 0 }, Q: { value: 0 }, connect() {} }),
    createBuffer: (_channels: number, length: number) => ({ getChannelData: () => new Float32Array(length) }),
    createPeriodicWave: () => ({}),
  };
  return { ctx, starts, gains };
}

/** Steps the fake clock forward, running the scheduler as the real timer would. */
function run(player: MusicPlayer, ctx: { currentTime: number }, until: number) {
  while (ctx.currentTime < until) {
    ctx.currentTime += 0.025;
    player.tick();
  }
}

const near = (a: number, b: number) => Math.abs(a - b) < 1e-6;

test("the player plays the intro once, then loops the theme in time", async () => {
  const { ctx, starts } = fakeAudio();
  const player = new MusicPlayer({ createContext: () => ctx as never, autoTick: false });
  assert.equal(await player.start(), true);
  run(player, ctx, 40);
  const bass = starts.filter((s) => s.kind === "triangle");
  const first = 0.08;
  // Intro bar 1 has no bass; bar 2 (Em) starts it at step 16. The loop begins after the 64-step intro, on the tonic.
  assert.ok(near(bass[0].time, first + 16 * 0.1), "intro bass enters in bar 2");
  assert.ok(bass.some((n) => near(n.time, first + 64 * 0.1) && Math.abs(n.hz - 82.41) < 0.01), "the loop starts on E2 right after the intro");
  // The loop is 256 steps (25.6 s): its first bass note comes round again exactly then, and the intro never returns.
  assert.ok(bass.some((n) => near(n.time, first + 64 * 0.1 + 256 * 0.1) && Math.abs(n.hz - 82.41) < 0.01), "the loop repeats");
  run(player, ctx, 70);
  assert.equal(starts.filter((s) => near(s.time, first + 16 * 0.1 + 320 * 0.1)).length > 0, true, "keeps going");
  player.dispose();
});

test("switching to the intense version happens on a bar line and keeps the place in the song", async () => {
  const { ctx, starts } = fakeAudio();
  const player = new MusicPlayer({ createContext: () => ctx as never, autoTick: false });
  await player.start();
  run(player, ctx, 10);
  player.setMode("intense");
  run(player, ctx, 20);
  const bass = starts.filter((s) => s.kind === "triangle");
  const loopStart = 0.08 + 6.4;
  // The intense bass plays sixteenths (0.089 s apart); the first of those must sit exactly on a bar line of the loop, with the
  // normal bass (eighths, 0.2 s apart) before it, and play that bar's chord root a whole tone higher: same place in the song.
  const i = bass.findIndex((n, k) => n.time > 10 && bass[k + 1] && near(bass[k + 1].time - n.time, 0.089));
  assert.ok(i > 0, "the intense bass arrived");
  const bar = (bass[i].time - loopStart) / 1.6;
  assert.ok(Math.abs(bar - Math.round(bar)) < 1e-6, `starts on a bar line (bar ${bar})`);
  assert.ok(near(bass[i].time - bass[i - 1].time, 0.2) || bass[i].time - bass[i - 1].time > 0.19, "the previous note was the slower, normal one");
  const normalRoot = THEMES.normal.loop.tracks.find((t) => t.name === "bass")!.notes.find((n) => n.step === (Math.round(bar) % 16) * STEPS_PER_BAR)!.midi;
  assert.ok(Math.abs(bass[i].hz - midiToHz(normalRoot + 2)) < 0.01, "the same chord, a whole tone up");  player.dispose();
});

test("a jingle replaces the theme, plays once and then stops", async () => {
  const { ctx, starts } = fakeAudio();
  const player = new MusicPlayer({ createContext: () => ctx as never, autoTick: false });
  await player.start();
  run(player, ctx, 12);
  const at = ctx.currentTime;
  player.playJingle("win");
  const jingleLength = VICTORY.section.steps * VICTORY.stepSeconds;
  run(player, ctx, at + jingleLength + 3);
  const late = starts.filter((s) => s.time > at + 0.35 + jingleLength + 0.2);
  assert.equal(late.length, 0, "nothing after the jingle");
  const during = starts.filter((s) => s.time >= at + 0.35 - 1e-9);
  assert.ok(during.length > 20, "the jingle's notes were played");
  assert.ok(during.every((s) => s.time < at + 0.35 + jingleLength + 1e-6));
  player.dispose();
});

test("the music ducks for a cry and recovers more slowly; volume follows a squared curve", async () => {
  const { ctx, gains } = fakeAudio();
  const player = new MusicPlayer({ createContext: () => ctx as never, autoTick: false });
  await player.start();
  const [duck, music] = gains;
  player.duck(true);
  player.duck(false);
  assert.equal(duck.setTargets[0][0], 0.35);
  assert.equal(duck.setTargets[1][0], 1);
  assert.ok(duck.setTargets[1][2] > duck.setTargets[0][2], "the recovery is slower than the dip");
  player.setVolume(0.5);
  assert.ok(near(music.setTargets.at(-1)![0], 0.5 * 0.5 * 0.5));
  player.setVolume(0);
  assert.equal(music.setTargets.at(-1)![0], 0);
  player.dispose();
});

test("without Web Audio the player reports it instead of throwing", async () => {
  const player = new MusicPlayer({
    createContext: () => {
      throw new Error("no audio");
    },
  });
  assert.equal(await player.start(), false);
  player.setVolume(0.3);
  player.duck(true);
  player.playJingle("lose");
  player.dispose();
});
