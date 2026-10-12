/**
 * The battle music, as data. Everything here is original: an E-minor battle theme (a 4-bar intro that flows into a 16-bar loop of
 * two 8-bar sections), a more intense variation of the same loop, and two short jingles. It is written for three chip channels,
 * like old handhelds: pulse (square) waves for lead and arpeggios, a triangle wave for bass, and noise for drums.
 *
 * Pure: no Web Audio here, so the notation can be checked by tests. The player is in music-engine.ts.
 * Time is counted in steps (sixteenth notes); a bar is 16 steps.
 */

export const STEPS_PER_BAR = 16;

const LETTERS: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/** "A4" is 69 (440 Hz). Sharps and flats: "F#5", "Bb3". */
export function noteToMidi(name: string): number {
  const match = /^([A-G])([#b]?)(-?\d)$/.exec(name);
  if (!match) throw new Error(`Not a note name: "${name}"`);
  const accidental = match[2] === "#" ? 1 : match[2] === "b" ? -1 : 0;
  return (Number(match[3]) + 1) * 12 + LETTERS[match[1]] + accidental;
}

export const midiToHz = (midi: number) => 440 * 2 ** ((midi - 69) / 12);

export interface NoteEvent {
  step: number;
  /** In steps. */
  length: number;
  midi: number;
}

export type DrumKind = "kick" | "snare" | "hat";
export interface DrumEvent {
  step: number;
  kind: DrumKind;
}

export interface Track {
  name: string;
  wave: "pulse" | "triangle";
  /** Pulse width, 0.5 being a square: narrower sounds thinner and more nasal. */
  duty: number;
  gain: number;
  notes: NoteEvent[];
}

export interface Section {
  steps: number;
  tracks: Track[];
  drums: DrumEvent[];
}

/** "E5:3 r:1 G5:2" -> notes from `start` (a rest is "r"), plus how many steps the text covers. */
export function parseLine(text: string, start = 0): { notes: NoteEvent[]; steps: number } {
  const notes: NoteEvent[] = [];
  let step = start;
  for (const token of text.trim().split(/\s+/)) {
    const [name, lengthText] = token.split(":");
    const length = Number(lengthText);
    if (!name || !Number.isInteger(length) || length < 1) throw new Error(`Bad token "${token}" in "${text}"`);
    if (name !== "r") notes.push({ step, length, midi: noteToMidi(name) });
    step += length;
  }
  return { notes, steps: step - start };
}

/** Lines of notation, one bar each, joined end to end. Every bar must fill its steps exactly. */
function melody(bars: string[], barSteps = STEPS_PER_BAR): { notes: NoteEvent[]; steps: number } {
  const notes: NoteEvent[] = [];
  let step = 0;
  bars.forEach((text, i) => {
    const bar = parseLine(text, step);
    if (bar.steps !== barSteps) throw new Error(`Bar ${i + 1} ("${text}") has ${bar.steps} steps, not ${barSteps}`);
    notes.push(...bar.notes);
    step += bar.steps;
  });
  return { notes, steps: step };
}

// ---- chords and the parts generated from them ---------------------------------------------------------------------------

interface Chord {
  /** Bass note. */
  root: string;
  /** Three tones, for arpeggios. */
  tones: [string, string, string];
}

const CHORDS = {
  Em: { root: "E2", tones: ["E4", "G4", "B4"] },
  C: { root: "C2", tones: ["C4", "E4", "G4"] },
  G: { root: "G2", tones: ["G3", "B3", "D4"] },
  D: { root: "D2", tones: ["D4", "F#4", "A4"] },
  Am: { root: "A2", tones: ["A3", "C4", "E4"] },
  B7: { root: "B1", tones: ["B3", "D#4", "F#4"] },
  F: { root: "F2", tones: ["F3", "A3", "C4"] },
} satisfies Record<string, Chord>;
type ChordName = keyof typeof CHORDS;

function arpeggio(progression: (ChordName | null)[]): NoteEvent[] {
  const order = [0, 1, 2, 1];
  const notes: NoteEvent[] = [];
  progression.forEach((name, bar) => {
    if (!name) return;
    for (let i = 0; i < STEPS_PER_BAR; i++) notes.push({ step: bar * STEPS_PER_BAR + i, length: 1, midi: noteToMidi(CHORDS[name].tones[order[i % 4]]) });
  });
  return notes;
}

/** Eighth-note bass with an octave jump on the third and seventh eighths; "driving" plays sixteenths for the intense version. */
function bassline(progression: (ChordName | null)[], driving: boolean): NoteEvent[] {
  const notes: NoteEvent[] = [];
  progression.forEach((name, bar) => {
    if (!name) return;
    const root = noteToMidi(CHORDS[name].root);
    const base = bar * STEPS_PER_BAR;
    if (driving) {
      for (let i = 0; i < STEPS_PER_BAR; i++) notes.push({ step: base + i, length: 1, midi: root + (i % 4 === 2 ? 12 : 0) });
    } else {
      for (let i = 0; i < 8; i++) notes.push({ step: base + i * 2, length: 2, midi: root + (i === 2 || i === 6 ? 12 : 0) });
    }
  });
  return notes;
}

/** K kick, S snare, h hat, . nothing: 16 characters per bar. */
function drumPattern(bars: (string | null)[]): DrumEvent[] {
  const kinds: Record<string, DrumKind> = { K: "kick", S: "snare", h: "hat" };
  const events: DrumEvent[] = [];
  bars.forEach((pattern, bar) => {
    if (!pattern) return;
    if (pattern.length !== STEPS_PER_BAR) throw new Error(`Drum bar ${bar + 1} ("${pattern}") is not ${STEPS_PER_BAR} characters`);
    [...pattern].forEach((c, i) => {
      if (kinds[c]) events.push({ step: bar * STEPS_PER_BAR + i, kind: kinds[c] });
    });
  });
  return events;
}

const transposed = (notes: NoteEvent[], semitones: number): NoteEvent[] => notes.map((n) => ({ ...n, midi: n.midi + semitones }));

// ---- the theme ----------------------------------------------------------------------------------------------------------

const INTRO_LEAD = [
  "r:8 B4:2 E5:2 G5:2 B5:2",
  "E6:6 D6:2 B5:4 G5:4",
  "C6:6 B5:2 G5:4 E5:4",
  "F#5:2 A5:2 B5:2 D#6:2 F#6:4 r:4",
];
const INTRO_CHORDS: (ChordName | null)[] = [null, "Em", "C", "B7"];
const INTRO_DRUMS = [null, "K...K...K...K...", "K.h.S.h.K.h.S.h.", "KhShKhShSSSSSSSS"];

const A_LEAD = [
  "E5:3 G5:1 B5:2 G5:2 E5:2 B4:2 E5:4",
  "C5:3 E5:1 G5:2 E5:2 C5:2 G4:2 C5:4",
  "D5:3 G5:1 B5:2 G5:2 D5:2 B4:2 D5:4",
  "F#5:3 A5:1 D6:2 A5:2 F#5:2 D5:2 F#5:4",
  "E5:2 E5:1 G5:1 B5:4 A5:2 G5:2 F#5:2 E5:2",
  "G5:2 G5:1 E5:1 C6:4 B5:2 A5:2 G5:2 E5:2",
  "A5:4 C6:2 B5:2 A5:2 E5:2 A5:4",
  "B5:2 D#6:2 F#6:4 E6:2 D#6:2 B5:2 A5:1 F#5:1",
];
const A_CHORDS: ChordName[] = ["Em", "C", "G", "D", "Em", "C", "Am", "B7"];

const B_LEAD = [
  "E6:2 r:1 E6:1 G6:2 E6:2 C6:2 E6:2 G6:2 E6:2",
  "F#6:2 r:1 F#6:1 A6:2 F#6:2 D6:2 F#6:2 A6:2 F#6:2",
  "G6:4 E6:2 G6:2 B6:4 G6:2 E6:2",
  "B6:2 A6:2 G6:2 F#6:2 E6:4 G6:2 B5:2",
  "C6:2 E6:2 G6:2 E6:2 C7:4 B6:2 G6:2",
  "D6:2 F#6:2 A6:2 F#6:2 A6:4 G6:2 F#6:2",
  "B5:2 D#6:2 F#6:2 B6:2 A6:2 F#6:2 D#6:2 B5:2",
  "B5:4 D#6:4 F#6:4 B6:3 r:1",
];
const B_CHORDS: ChordName[] = ["C", "D", "Em", "Em", "C", "D", "B7", "B7"];

const A_DRUMS = Array<string>(8).fill("K.h.S.h.K.h.S.hh");
const B_DRUMS = Array<string>(8).fill("KhhhShhhKhKhShhS");

/** Tracks for a stretch of the song. `intense` adds a bass an octave under the lead's doubling and drives the bass in sixteenths. */
function themeSection(lead: string[], chords: (ChordName | null)[], drums: (string | null)[], intense: boolean, semitones: number): Section {
  const m = melody(lead);
  const tracks: Track[] = [
    { name: "lead", wave: "pulse", duty: 0.25, gain: 0.22, notes: transposed(m.notes, semitones) },
    { name: "arp", wave: "pulse", duty: 0.125, gain: 0.075, notes: transposed(arpeggio(chords), semitones) },
    { name: "bass", wave: "triangle", duty: 0.5, gain: 0.34, notes: transposed(bassline(chords, intense), semitones) },
  ];
  if (intense) tracks.push({ name: "lead-low", wave: "pulse", duty: 0.5, gain: 0.09, notes: transposed(m.notes, semitones - 12) });
  return { steps: m.steps, tracks, drums: drumPattern(drums) };
}

function concat(a: Section, b: Section): Section {
  const shift = (notes: NoteEvent[]) => notes.map((n) => ({ ...n, step: n.step + a.steps }));
  return {
    steps: a.steps + b.steps,
    tracks: a.tracks.map((track) => ({ ...track, notes: [...track.notes, ...shift(b.tracks.find((t) => t.name === track.name)?.notes ?? [])] })),
    drums: [...a.drums, ...b.drums.map((d) => ({ ...d, step: d.step + a.steps }))],
  };
}

export interface Theme {
  /** Seconds per step. */
  stepSeconds: number;
  intro: Section | null;
  loop: Section;
}

/** 150 beats a minute (sixteenth = 0.1 s). The intro ends on a B7 that resolves into the loop's first E minor bar. */
const NORMAL: Theme = {
  stepSeconds: 0.1,
  intro: themeSection(INTRO_LEAD, INTRO_CHORDS, INTRO_DRUMS, false, 0),
  loop: concat(themeSection(A_LEAD, A_CHORDS, A_DRUMS, false, 0), themeSection(B_LEAD, B_CHORDS, B_DRUMS, false, 0)),
};

/** The same loop a whole tone higher (F# minor), 12 % faster, with a driving bass, a doubled lead and busier drums. */
const INTENSE: Theme = {
  stepSeconds: 0.089,
  intro: null,
  loop: concat(
    themeSection(A_LEAD, A_CHORDS, Array<string>(8).fill("KhhhShhhKhKhShhS"), true, 2),
    themeSection(B_LEAD, B_CHORDS, Array<string>(8).fill("KhShKhShKhKhShSS"), true, 2),
  ),
};

export const THEMES = { normal: NORMAL, intense: INTENSE } as const;
export type ThemeMode = keyof typeof THEMES;

// ---- jingles ------------------------------------------------------------------------------------------------------------

export interface Jingle {
  stepSeconds: number;
  section: Section;
}

function jingleSection(lead: string[], harmony: string[], bass: string[], drums: (string | null)[], barSteps = STEPS_PER_BAR): Section {
  const l = melody(lead, barSteps);
  return {
    steps: l.steps,
    tracks: [
      { name: "lead", wave: "pulse", duty: 0.25, gain: 0.24, notes: l.notes },
      { name: "harmony", wave: "pulse", duty: 0.5, gain: 0.09, notes: melody(harmony, barSteps).notes },
      { name: "bass", wave: "triangle", duty: 0.5, gain: 0.34, notes: melody(bass, barSteps).notes },
    ],
    drums: drumPattern(drums),
  };
}

/** A rising C major fanfare, 160 beats a minute, about 4.5 seconds. */
export const VICTORY: Jingle = {
  stepSeconds: 60 / 160 / 4,
  section: jingleSection(
    ["C5:2 E5:2 G5:2 C6:4 B5:2 C6:2 D6:2", "E6:2 D6:2 E6:2 G6:4 E6:2 C6:4", "C6:16"],
    ["E4:2 G4:2 C5:2 E5:4 D5:2 E5:2 F5:2", "G4:2 F4:2 G4:2 A4:4 G4:2 A4:4", "E5:16"],
    ["C3:4 C3:4 G2:4 G2:4", "F2:4 F2:4 F2:4 F2:4", "C2:16"],
    ["K.h.S.h.K.h.S.hS", "K.h.S.h.K.h.S.h.", "S..............."],
  ),
};

/** A slow minor descent, 100 beats a minute, about 5 seconds. */
export const DEFEAT: Jingle = {
  stepSeconds: 60 / 100 / 4,
  section: jingleSection(
    ["B5:3 r:1 A5:3 r:1 G5:3 r:1 F#5:4", "E5:6 B4:2 E4:8"],
    ["G4:8 E4:8", "F#4:8 E4:8"],
    ["E2:8 C2:8", "B1:8 E2:8"],
    ["K...............", null],
  ),
};

// ---- when to turn it up -------------------------------------------------------------------------------------------------

/** True when exactly one Pokémon is left standing and it is the one on the field: "your last Pokémon is in". */
export function isLastStand(side: { mons: { fainted: boolean }[]; teamSize: number; active: number }): boolean {
  if (side.teamSize < 2 || side.mons.length < side.teamSize) return false;
  const alive = side.mons.filter((m) => !m.fainted).length;
  return alive === 1 && side.active >= 0 && !side.mons[side.active]?.fainted;
}
