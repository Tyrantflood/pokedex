/**
 * Turns the simulator's text protocol (one line per event, see Showdown's PROTOCOL.md) into a view of the battle that the
 * UI draws and the CPU reasons over. Pure: no simulator import, so species/move facts come in through `Lookups`.
 *
 * `applyLine` mutates the view and returns what the UI should do for that line: a short narration for the log, an optional
 * animation cue, and how long to hold before the next line. The same reducer runs for the player and for the CPU (each from
 * its own side's stream), so a side's own Pokémon have absolute HP and the other side's are percentages (maxHp 100).
 */

export type SideId = "p1" | "p2";
export const otherSide = (side: SideId): SideId => (side === "p1" ? "p2" : "p1");

export interface SpeciesInfo {
  /** PokéAPI id used for sprites and cries. */
  spriteId: number;
  types: string[];
}
export interface MoveInfo {
  type: string;
  category: string;
}
export interface Lookups {
  species(name: string): SpeciesInfo;
  move(name: string): MoveInfo;
}

export interface MonView {
  /** Name the protocol knows it by (the "nickname"; the species name in random battles). Unique within a side. */
  nickname: string;
  /** Current species or forme, e.g. "Charizard-Mega-X". */
  species: string;
  spriteId: number;
  types: string[];
  level: number;
  gender: string;
  hp: number;
  maxHp: number;
  status: string;
  fainted: boolean;
  boosts: Record<string, number>;
  volatiles: string[];
  /** Terastallized type, once it has happened. */
  tera: string | null;
  item: string | null;
  ability: string | null;
  /** Own Pokémon only (from the request). */
  moves: string[];
  stats: { atk: number; def: number; spa: number; spd: number; spe: number } | null;
  teraType: string | null;
}

export interface SideView {
  id: SideId;
  name: string;
  teamSize: number;
  mons: MonView[];
  /** Index into `mons` of the Pokémon in battle, or -1. */
  active: number;
  conditions: string[];
}

export interface LogEntry {
  text: string;
  tone: "plain" | "move" | "good" | "bad" | "faint" | "turn" | "win";
}

export interface BattleView {
  gen: number;
  turn: number;
  sides: Record<SideId, SideView>;
  weather: string;
  terrain: string;
  fieldEffects: string[];
  log: LogEntry[];
  /** Winner's name, "" for a tie, null while the battle goes on. */
  winner: string | null;
}

export type CueKind =
  | "move"
  | "damage"
  | "heal"
  | "faint"
  | "switch"
  | "status"
  | "boost"
  | "unboost"
  | "miss"
  | "tera"
  | "mega"
  | "win"
  | "text";

export interface Cue {
  kind: CueKind;
  side: SideId;
  /** The target's side for a move, when it has one. */
  target?: SideId;
  moveType?: string;
  /** Hit-effectiveness of the last move: set on damage cues that follow a super effective / resisted line. */
  effect?: "super" | "resisted" | "immune" | "crit";
  /** Short text to float over the Pokémon: "-27%", "BRN", "Atk ?". */
  label?: string;
}

export interface LineResult {
  cue?: Cue;
  /** Milliseconds to hold before the next line at normal speed; 0 for lines that change nothing visible. */
  delay: number;
}

export function createView(): BattleView {
  const side = (id: SideId): SideView => ({ id, name: id === "p1" ? "Player 1" : "Player 2", teamSize: 6, mons: [], active: -1, conditions: [] });
  return { gen: 9, turn: 0, sides: { p1: side("p1"), p2: side("p2") }, weather: "", terrain: "", fieldEffects: [], log: [], winner: null };
}

export function cloneView(view: BattleView): BattleView {
  return structuredClone(view);
}

// ---------------------------------------------------------------------------------------------------------------------

export interface Ident {
  side: SideId;
  position: string;
  name: string;
}

/** "p1a: Charizard" or "p1: Charizard" (request form) to its parts. */
export function parseIdent(text: string): Ident {
  const colon = text.indexOf(": ");
  const head = colon >= 0 ? text.slice(0, colon) : text;
  return { side: head.slice(0, 2) as SideId, position: head.slice(2), name: colon >= 0 ? text.slice(colon + 2) : "" };
}

export function parseCondition(condition: string): { hp: number; maxHp: number; status: string; fainted: boolean } {
  const [hpPart, status = ""] = condition.split(" ");
  if (hpPart === "0" || status === "fnt") return { hp: 0, maxHp: 100, status: "", fainted: true };
  const [hp, maxHp] = hpPart.split("/").map(Number);
  return { hp, maxHp: maxHp || 100, status, fainted: hp <= 0 };
}

export function parseDetails(details: string): { species: string; level: number; gender: string } {
  const [species, ...flags] = details.split(", ");
  let level = 100;
  let gender = "N";
  for (const flag of flags) {
    if (/^L\d+$/.test(flag)) level = Number(flag.slice(1));
    else if (flag === "M" || flag === "F") gender = flag;
  }
  return { species, level, gender };
}

function newMon(nickname: string, species: string, level: number, gender: string, lookups: Lookups): MonView {
  const info = lookups.species(species);
  return {
    nickname,
    species,
    spriteId: info.spriteId,
    types: info.types,
    level,
    gender,
    hp: 100,
    maxHp: 100,
    status: "",
    fainted: false,
    boosts: {},
    volatiles: [],
    tera: null,
    item: null,
    ability: null,
    moves: [],
    stats: null,
    teraType: null,
  };
}

/** The Pokémon a name refers to on a side, created if the protocol mentions it for the first time. */
function monFor(view: BattleView, ident: Ident, lookups: Lookups, details?: { species: string; level: number; gender: string }): MonView {
  const side = view.sides[ident.side];
  let mon = side.mons.find((m) => m.nickname === ident.name);
  if (!mon) {
    const d = details ?? { species: ident.name, level: 100, gender: "N" };
    mon = newMon(ident.name, d.species, d.level, d.gender, lookups);
    side.mons.push(mon);
  }
  return mon;
}

export function activeMon(view: BattleView, side: SideId): MonView | null {
  const s = view.sides[side];
  return s.active >= 0 ? (s.mons[s.active] ?? null) : null;
}

/** How a Pokémon is named in the log: "Pikachu", or "The opposing Pikachu" for the other side. */
function label(view: BattleView, ownSide: SideId, ident: Ident): string {
  return ident.side === ownSide ? ident.name : `The opposing ${ident.name}`;
}

const STAT_NAMES: Record<string, string> = {
  atk: "Attack",
  def: "Defense",
  spa: "Sp. Atk",
  spd: "Sp. Def",
  spe: "Speed",
  accuracy: "accuracy",
  evasion: "evasiveness",
};

const STATUS_TEXT: Record<string, string> = {
  brn: "was burned!",
  par: "is paralyzed! It may be unable to move!",
  slp: "fell asleep!",
  frz: "was frozen solid!",
  psn: "was poisoned!",
  tox: "was badly poisoned!",
};

const CURE_TEXT: Record<string, string> = {
  brn: "burn was healed!",
  par: "was cured of paralysis!",
  slp: "woke up!",
  frz: "thawed out!",
  psn: "was cured of its poisoning!",
  tox: "was cured of its poisoning!",
};

const HOLD = { move: 950, damage: 650, heal: 550, faint: 1000, switch: 900, status: 650, boost: 550, text: 500, big: 1100, turn: 250 };

const effectName = (text: string) => text.replace(/^(move|ability|item): /, "");

/** "[from] item: Life Orb" style tags on a line, as a map. */
function tags(parts: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of parts) {
    const m = /^\[(\w+)\]\s*(.*)$/.exec(part);
    if (m) out[m[1]] = m[2];
  }
  return out;
}

function push(view: BattleView, text: string, tone: LogEntry["tone"] = "plain") {
  view.log.push({ text, tone });
  if (view.log.length > 400) view.log.splice(0, view.log.length - 400);
}

function setCondition(mon: MonView, condition: string) {
  const c = parseCondition(condition);
  if (!Number.isFinite(c.hp)) return; // not an HP field: leave the Pokémon as it was
  mon.hp = c.hp;
  mon.maxHp = c.maxHp;
  mon.status = c.status;
  mon.fainted = c.fainted;
}

function hpFraction(mon: MonView) {
  return mon.maxHp > 0 ? mon.hp / mon.maxHp : 0;
}

/**
 * Applies one protocol line. `ownSide` is the side whose stream this is (used only for wording: "The opposing ..." and
 * "Go!"). Unknown or irrelevant lines are ignored and return `delay: 0`.
 */
export function applyLine(view: BattleView, line: string, ownSide: SideId, lookups: Lookups): LineResult {
  if (!line.startsWith("|")) return { delay: 0 };
  const parts = line.slice(1).split("|");
  const cmd = parts[0];
  const arg = (i: number) => parts[i + 1] ?? "";
  const quiet: LineResult = { delay: 0 };

  switch (cmd) {
    case "gen":
      view.gen = Number(arg(0)) || view.gen;
      return quiet;
    case "player": {
      const side = view.sides[arg(0) as SideId];
      if (side && arg(1)) side.name = arg(1);
      return quiet;
    }
    case "teamsize": {
      const side = view.sides[arg(0) as SideId];
      if (side) side.teamSize = Number(arg(1)) || side.teamSize;
      return quiet;
    }
    case "turn":
      view.turn = Number(arg(0)) || view.turn;
      push(view, `Turn ${view.turn}`, "turn");
      return { delay: HOLD.turn };
    case "switch":
    case "drag":
    case "replace": {
      const ident = parseIdent(arg(0));
      const details = parseDetails(arg(1));
      const side = view.sides[ident.side];
      if (cmd === "replace") {
        // An Illusion ends: the Pokémon on the field (shown as another species) turns out to be a different one. It is the same
        // team member, so rename it in place rather than adding a phantom that could never faint.
        const disguised = side.active >= 0 ? side.mons[side.active] : null;
        const known = side.mons.find((m) => m.nickname === ident.name);
        const mon = known ?? disguised ?? monFor(view, ident, lookups, details);
        if (!known && disguised) mon.nickname = ident.name;
        if (known && disguised && known !== disguised) side.mons.splice(side.mons.indexOf(disguised), 1);
        side.active = side.mons.indexOf(mon);
        applyForme(mon, details.species, lookups);
        return { delay: HOLD.text };
      }
      const mon = monFor(view, ident, lookups, details);
      // Leaving the field clears what only lasts while out.
      const previous = side.active >= 0 ? side.mons[side.active] : null;
      if (previous) {
        previous.boosts = {};
        previous.volatiles = [];
      }
      mon.species = details.species;
      mon.level = details.level;
      mon.gender = details.gender;
      applyForme(mon, details.species, lookups);
      setCondition(mon, arg(2));
      side.active = side.mons.indexOf(mon);
      const who = ident.side === ownSide ? `Go! ${mon.nickname}!` : `${side.name} sent out ${mon.nickname}!`;
      push(view, cmd === "drag" ? `${mon.nickname} was dragged out!` : who, "plain");
      return { cue: { kind: "switch", side: ident.side }, delay: HOLD.switch };
    }
    case "detailschange":
    case "-formechange": {
      const ident = parseIdent(arg(0));
      const mon = monFor(view, ident, lookups);
      const species = cmd === "detailschange" ? parseDetails(arg(1)).species : arg(1);
      applyForme(mon, species, lookups);
      if (cmd === "detailschange" && /^\d/.test(arg(2))) setCondition(mon, arg(2)); // the 3rd field is HP, or a tag such as [silent]
      return { cue: { kind: "mega", side: ident.side }, delay: HOLD.big };
    }
    case "-mega": {
      const ident = parseIdent(arg(0));
      push(view, `${label(view, ownSide, ident)} has Mega Evolved!`, "good");
      return { delay: 300 };
    }
    case "move": {
      const ident = parseIdent(arg(0));
      const moveName = arg(1);
      const target = arg(2) ? parseIdent(arg(2)) : null;
      const t = tags(parts.slice(4));
      const info = lookups.move(moveName);
      const subject = label(view, ownSide, ident);
      push(view, `${subject} used ${moveName}!`, "move");
      if (t.miss !== undefined) push(view, `${target ? label(view, ownSide, target) : "The target"} avoided the attack!`);
      return { cue: { kind: "move", side: ident.side, target: target?.side, moveType: info.type }, delay: HOLD.move };
    }
    case "cant": {
      const ident = parseIdent(arg(0));
      const reason = arg(1);
      const subject = label(view, ownSide, ident);
      const text: Record<string, string> = {
        par: `${subject} is paralyzed! It can't move!`,
        slp: `${subject} is fast asleep.`,
        frz: `${subject} is frozen solid!`,
        flinch: `${subject} flinched and couldn't move!`,
        recharge: `${subject} must recharge!`,
      };
      push(view, text[reason] ?? `${subject} can't move! (${effectName(reason)})`, "bad");
      return { delay: HOLD.text };
    }
    case "-damage":
    case "-sethp": {
      const ident = parseIdent(arg(0));
      const mon = monFor(view, ident, lookups);
      const before = hpFraction(mon);
      setCondition(mon, arg(1));
      if (!mon.fainted) mon.status = parseCondition(arg(1)).status;
      const t = tags(parts.slice(3));
      if (t.from) {
        const from = effectName(t.from);
        const subject = label(view, ownSide, ident);
        const lines: Record<string, string> = {
          brn: `${subject} was hurt by its burn!`,
          psn: `${subject} was hurt by poison!`,
          tox: `${subject} was hurt by poison!`,
          "Stealth Rock": `Pointed stones dug into ${subject}!`,
          Spikes: `${subject} was hurt by the spikes!`,
          sandstorm: `${subject} is buffeted by the sandstorm!`,
          Sandstorm: `${subject} is buffeted by the sandstorm!`,
          hail: `${subject} is buffeted by the hail!`,
          Hail: `${subject} is buffeted by the hail!`,
          Recoil: `${subject} is damaged by recoil!`,
          recoil: `${subject} is damaged by recoil!`,
          "Life Orb": `${subject} lost some of its HP!`,
          "Leech Seed": `${subject}'s health is sapped by Leech Seed!`,
        };
        push(view, lines[from] ?? `${subject} was hurt by ${from}!`, "bad");
      }
      const lost = Math.round((before - hpFraction(mon)) * 100);
      return { cue: { kind: "damage", side: ident.side, label: lost > 0 ? `-${lost}%` : undefined }, delay: lost > 0 ? HOLD.damage : HOLD.text };
    }
    case "-heal": {
      const ident = parseIdent(arg(0));
      const mon = monFor(view, ident, lookups);
      setCondition(mon, arg(1));
      const t = tags(parts.slice(3));
      const subject = label(view, ownSide, ident);
      push(view, t.from ? `${subject} restored HP with ${effectName(t.from)}.` : `${subject} regained health!`, "good");
      return { cue: { kind: "heal", side: ident.side, label: "+HP" }, delay: HOLD.heal };
    }
    case "faint": {
      const ident = parseIdent(arg(0));
      const mon = monFor(view, ident, lookups);
      mon.hp = 0;
      mon.fainted = true;
      mon.status = "";
      push(view, `${label(view, ownSide, ident)} fainted!`, "faint");
      return { cue: { kind: "faint", side: ident.side }, delay: HOLD.faint };
    }
    case "-status": {
      const ident = parseIdent(arg(0));
      const mon = monFor(view, ident, lookups);
      mon.status = arg(1);
      push(view, `${label(view, ownSide, ident)} ${STATUS_TEXT[arg(1)] ?? `got ${arg(1)}!`}`, "bad");
      return { cue: { kind: "status", side: ident.side, label: arg(1).toUpperCase() }, delay: HOLD.status };
    }
    case "-curestatus": {
      const ident = parseIdent(arg(0));
      const mon = monFor(view, ident, lookups);
      mon.status = "";
      push(view, `${label(view, ownSide, ident)}'s ${CURE_TEXT[arg(1)] ?? "status was cured!"}`, "good");
      return { delay: HOLD.text };
    }
    case "-boost":
    case "-unboost": {
      const ident = parseIdent(arg(0));
      const mon = monFor(view, ident, lookups);
      const stat = arg(1);
      const amount = Number(arg(2)) || 0;
      const delta = cmd === "-boost" ? amount : -amount;
      mon.boosts[stat] = Math.max(-6, Math.min(6, (mon.boosts[stat] ?? 0) + delta));
      const how = amount >= 3 ? (delta > 0 ? "rose drastically" : "fell severely") : amount === 2 ? (delta > 0 ? "rose sharply" : "harshly fell") : delta > 0 ? "rose" : "fell";
      push(view, `${label(view, ownSide, ident)}'s ${STAT_NAMES[stat] ?? stat} ${how}!`, delta > 0 ? "good" : "bad");
      return { cue: { kind: delta > 0 ? "boost" : "unboost", side: ident.side, label: `${STAT_NAMES[stat] ?? stat} ${delta > 0 ? "▲" : "▼"}` }, delay: HOLD.boost };
    }
    case "-setboost": {
      const mon = monFor(view, parseIdent(arg(0)), lookups);
      mon.boosts[arg(1)] = Number(arg(2)) || 0;
      return { delay: HOLD.text };
    }
    case "-clearboost":
    case "-clearnegativeboost": {
      const mon = monFor(view, parseIdent(arg(0)), lookups);
      if (cmd === "-clearboost") mon.boosts = {};
      else for (const k of Object.keys(mon.boosts)) if (mon.boosts[k] < 0) delete mon.boosts[k];
      return quiet;
    }
    case "-clearallboost":
      for (const s of ["p1", "p2"] as const) for (const m of view.sides[s].mons) m.boosts = {};
      push(view, "All stat changes were eliminated!");
      return { delay: HOLD.text };
    case "-weather": {
      const w = arg(0);
      view.weather = w === "none" ? "" : w;
      if (!parts.includes("[upkeep]")) {
        const text: Record<string, string> = {
          RainDance: "It started to rain!",
          PrimordialSea: "A heavy rain began to fall!",
          Sandstorm: "A sandstorm kicked up!",
          SunnyDay: "The sunlight turned harsh!",
          DesolateLand: "The sunlight turned extremely harsh!",
          Hail: "It started to hail!",
          Snow: "It started to snow!",
          DeltaStream: "Mysterious strong winds are protecting Flying-type Pokémon!",
          none: "The weather cleared up.",
        };
        push(view, text[w] ?? `The weather changed (${w}).`);
        return { delay: HOLD.text };
      }
      return quiet;
    }
    case "-fieldstart":
    case "-fieldend": {
      const name = effectName(arg(0));
      const start = cmd === "-fieldstart";
      if (/terrain$/i.test(name)) view.terrain = start ? name : "";
      else view.fieldEffects = start ? [...new Set([...view.fieldEffects, name])] : view.fieldEffects.filter((e) => e !== name);
      push(view, start ? `${name} took effect.` : `${name} faded.`);
      return { delay: HOLD.text };
    }
    case "-sidestart":
    case "-sideend": {
      const side = view.sides[parseIdent(arg(0)).side];
      const name = effectName(arg(1));
      const start = cmd === "-sidestart";
      if (side) {
        if (start && !side.conditions.includes(name)) side.conditions.push(name);
        if (!start) side.conditions = side.conditions.filter((c) => c !== name);
        const who = side.id === ownSide ? "your side" : "the opposing side";
        push(view, start ? `${name} was set on ${who}.` : `${name} wore off on ${who}.`);
      }
      return { delay: HOLD.text };
    }
    case "-start":
    case "-end": {
      const ident = parseIdent(arg(0));
      const mon = monFor(view, ident, lookups);
      const name = effectName(arg(1));
      if (name === "typechange" || name === "typeadd") {
        if (name === "typechange" && arg(2)) mon.types = arg(2).split("/");
        return { delay: HOLD.text };
      }
      const start = cmd === "-start";
      mon.volatiles = start ? [...new Set([...mon.volatiles, name])] : mon.volatiles.filter((v) => v !== name);
      if (start && /^(Substitute)$/.test(name)) push(view, `${label(view, ownSide, ident)} put in a substitute!`);
      else if (start && name === "confusion") push(view, `${label(view, ownSide, ident)} became confused!`, "bad");
      else if (!start && name === "Substitute") push(view, `${label(view, ownSide, ident)}'s substitute faded!`);
      else if (start && name === "Dynamax") push(view, `${label(view, ownSide, ident)} Dynamaxed!`, "good");
      else if (!start && name === "Dynamax") push(view, `${label(view, ownSide, ident)}'s Dynamax ended.`);
      else return quiet;
      return { delay: HOLD.text };
    }
    case "-terastallize": {
      const ident = parseIdent(arg(0));
      const mon = monFor(view, ident, lookups);
      mon.tera = arg(1);
      mon.types = [arg(1)];
      push(view, `${label(view, ownSide, ident)} Terastallized into the ${arg(1)} type!`, "good");
      return { cue: { kind: "tera", side: ident.side, moveType: arg(1).toLowerCase() }, delay: HOLD.big };
    }
    case "-supereffective":
      push(view, "It's super effective!", "good");
      return { cue: { kind: "text", side: parseIdent(arg(0)).side, effect: "super", label: "Super effective!" }, delay: HOLD.text };
    case "-resisted":
      push(view, "It's not very effective...", "bad");
      return { cue: { kind: "text", side: parseIdent(arg(0)).side, effect: "resisted", label: "Resisted" }, delay: HOLD.text };
    case "-crit":
      push(view, "A critical hit!", "good");
      return { cue: { kind: "text", side: parseIdent(arg(0)).side, effect: "crit", label: "Critical hit!" }, delay: HOLD.text };
    case "-immune": {
      const ident = parseIdent(arg(0));
      push(view, `It doesn't affect ${label(view, ownSide, ident).replace(/^The opposing /, "the opposing ")}...`, "bad");
      return { cue: { kind: "text", side: ident.side, effect: "immune", label: "No effect" }, delay: HOLD.text };
    }
    case "-miss": {
      const target = arg(1) ? parseIdent(arg(1)) : parseIdent(arg(0));
      push(view, `${label(view, ownSide, parseIdent(arg(0)))}'s attack missed!`, "bad");
      return { cue: { kind: "miss", side: target.side, label: "Missed" }, delay: HOLD.text };
    }
    case "-fail":
    case "-notarget":
      push(view, "But it failed!", "bad");
      return { delay: HOLD.text };
    case "-ability": {
      const ident = parseIdent(arg(0));
      const mon = monFor(view, ident, lookups);
      mon.ability = arg(1);
      if (!tags(parts.slice(3)).silent) push(view, `${label(view, ownSide, ident)}'s ${arg(1)}!`);
      return { delay: HOLD.text };
    }
    case "-item":
    case "-enditem": {
      const ident = parseIdent(arg(0));
      const mon = monFor(view, ident, lookups);
      mon.item = cmd === "-item" ? arg(1) : null;
      if (cmd === "-enditem") push(view, `${label(view, ownSide, ident)}'s ${arg(1)} was used up!`);
      else if (!tags(parts.slice(3)).silent) push(view, `${label(view, ownSide, ident)} has ${arg(1)}.`);
      return { delay: HOLD.text };
    }
    case "-singleturn": {
      const ident = parseIdent(arg(0));
      const name = effectName(arg(1));
      if (/^(Protect|Detect|Spiky Shield|King's Shield|Baneful Bunker|Obstruct|Silk Trap|Burning Bulwark)$/.test(name)) {
        push(view, `${label(view, ownSide, ident)} protected itself!`);
        return { delay: HOLD.text };
      }
      return quiet;
    }
    case "-prepare":
      push(view, `${label(view, ownSide, parseIdent(arg(0)))} is preparing ${arg(1)}!`);
      return { delay: HOLD.text };
    case "-mustrecharge":
      return quiet;
    case "-hitcount":
      push(view, `Hit ${arg(1)} time(s)!`);
      return { delay: 300 };
    case "-message":
      push(view, arg(0));
      return { delay: HOLD.text };
    case "win": {
      view.winner = arg(0);
      push(view, `${arg(0)} won the battle!`, "win");
      return { cue: { kind: "win", side: view.sides.p1.name === arg(0) ? "p1" : "p2" }, delay: HOLD.big };
    }
    case "tie":
      view.winner = "";
      push(view, "The battle ended in a tie.", "win");
      return { delay: HOLD.big };
    default:
      return quiet;
  }
}

function applyForme(mon: MonView, species: string, lookups: Lookups) {
  const info = lookups.species(species);
  mon.species = species;
  mon.spriteId = info.spriteId;
  if (!mon.tera) mon.types = info.types;
}

// ---------------------------------------------------------------------------------------------------------------------
// Requests: what the player may do next.

export interface MoveSlot {
  id: string;
  name: string;
  /** Null for a locked-in move (Outrage, a charging turn), which the request lists without PP. */
  pp: number | null;
  maxPp: number;
  disabled: boolean;
}

export interface ActiveOptions {
  moves: MoveSlot[];
  /** Some move can't be chosen at all / the Pokémon can't switch out. */
  trapped: boolean;
  canMega: boolean;
  canUltra: boolean;
  /** Per move: the Z-Move it would become, or null. */
  zMoves: (string | null)[];
  canDynamax: boolean;
  /** Names of the Max Moves while Dynamax is available or active, parallel to `moves`. */
  maxMoves: string[] | null;
  canTera: string | null;
}

export interface RequestMon {
  nickname: string;
  species: string;
  level: number;
  gender: string;
  hp: number;
  maxHp: number;
  status: string;
  fainted: boolean;
  active: boolean;
  item: string | null;
  ability: string | null;
  moves: string[];
  stats: MonView["stats"];
  teraType: string | null;
  terastallized: string | null;
}

export interface ParsedRequest {
  rqid: number;
  wait: boolean;
  teamPreview: boolean;
  /** The active Pokémon fainted or must switch: pick from the team. */
  forceSwitch: boolean;
  active: ActiveOptions | null;
  team: RequestMon[];
}

/* eslint-disable @typescript-eslint/no-explicit-any -- the request is untyped JSON from the simulator; every field is read defensively */
export function parseRequest(raw: any): ParsedRequest {
  const team: RequestMon[] = (raw.side?.pokemon ?? []).map((p: any): RequestMon => {
    const ident = parseIdent(String(p.ident));
    const details = parseDetails(String(p.details));
    const c = parseCondition(String(p.condition));
    return {
      nickname: ident.name,
      species: details.species,
      level: details.level,
      gender: details.gender,
      hp: c.hp,
      maxHp: c.maxHp,
      status: c.status,
      fainted: c.fainted,
      active: !!p.active,
      item: p.item ? String(p.item) : null,
      ability: p.ability ? String(p.ability) : p.baseAbility ? String(p.baseAbility) : null,
      moves: Array.isArray(p.moves) ? p.moves.map(String) : [],
      stats: p.stats ?? null,
      teraType: p.teraType ?? null,
      terastallized: p.terastallized || null,
    };
  });
  const a = raw.active?.[0];
  const active: ActiveOptions | null = a
    ? {
        moves: (a.moves ?? []).map((m: any): MoveSlot => ({ id: String(m.id), name: String(m.move), pp: typeof m.pp === "number" ? m.pp : null, maxPp: m.maxpp ?? 0, disabled: !!m.disabled })),
        trapped: !!(a.trapped || a.maybeTrapped),
        canMega: !!(a.canMegaEvo || a.canMegaEvoX || a.canMegaEvoY),
        canUltra: !!a.canUltraBurst,
        zMoves: Array.isArray(a.canZMove) ? a.canZMove.map((z: any) => (z ? String(z.move) : null)) : [],
        canDynamax: !!a.canDynamax,
        maxMoves: a.maxMoves?.maxMoves ? a.maxMoves.maxMoves.map((m: any) => String(m.move)) : null,
        canTera: a.canTerastallize ?? null,
      }
    : null;
  return {
    rqid: Number(raw.rqid) || 0,
    wait: !!raw.wait,
    teamPreview: !!raw.teamPreview,
    forceSwitch: Array.isArray(raw.forceSwitch) && raw.forceSwitch.some(Boolean),
    active,
    team,
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/** Copies what a request knows about the player's own team into the view (full HP, moves, item, stats), creating the bench. */
export function syncRequest(view: BattleView, side: SideId, request: ParsedRequest, lookups: Lookups) {
  const s = view.sides[side];
  for (const p of request.team) {
    const mon = monFor(view, { side, position: "", name: p.nickname }, lookups, { species: p.species, level: p.level, gender: p.gender });
    // Don't let a request that arrives mid-animation overwrite a forme the log hasn't reached: only fill in what the log can't know.
    mon.level = p.level;
    mon.gender = p.gender;
    mon.item = p.item;
    mon.ability = p.ability ?? mon.ability;
    mon.moves = p.moves;
    mon.stats = p.stats;
    mon.teraType = p.teraType;
    mon.hp = p.hp;
    mon.maxHp = p.maxHp;
    mon.status = p.status;
    mon.fainted = p.fainted;
    if (p.terastallized) mon.tera = p.terastallized;
  }
  s.teamSize = Math.max(s.teamSize, request.team.length);
}
