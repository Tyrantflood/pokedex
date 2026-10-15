/** The two CPU opponents, driving one side of a local battle through the simulator's player stream. */
import { BattleStreams } from "@pkmn/sim";
import type { ModdedDex } from "@pkmn/sim";
import { toId } from "./ids";
import { bestSwitch, isBadMatchup, matchupScore, NO_GOOD_MOVE, scoreMove, type BenchOption, type FighterFacts, type Matchup } from "./cpu-logic";
import { makeLookups, matchupFor, moveFacts } from "./dex-facts";
import {
  activeMon,
  applyLine,
  createView,
  otherSide,
  parseRequest,
  syncRequest,
  type ActiveOptions,
  type BattleView,
  type Lookups,
  type ParsedRequest,
  type SideId,
} from "./protocol";

export type Difficulty = "easy" | "normal";

/** Small seeded generator (mulberry32) so a CPU's choices are repeatable from a seed. */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class CpuPlayer extends BattleStreams.BattlePlayer {
  readonly view: BattleView = createView();
  private readonly side: SideId;
  private readonly dex: ModdedDex;
  private readonly difficulty: Difficulty;
  private readonly lookups: Lookups;
  /** Type maths from the simulator's data for this generation, and the generation (for which abilities grant immunities). */
  private readonly matchup: Matchup;
  private readonly random: () => number;
  private lastSwitchTurn = -10;
  private errors = 0;

  constructor(stream: ConstructorParameters<typeof BattleStreams.BattlePlayer>[0], side: SideId, dex: ModdedDex, difficulty: Difficulty, seed: number) {
    super(stream);
    this.side = side;
    this.dex = dex;
    this.difficulty = difficulty;
    this.lookups = makeLookups(dex);
    this.matchup = matchupFor(dex);
    this.random = seededRandom(seed);
  }

  /** Applies the whole chunk to the CPU's view first and only then looks at the request, whichever order the simulator sent them in. */
  receive(chunk: string) {
    let raw: unknown = null;
    for (const line of chunk.split("\n")) {
      if (line.startsWith("|request|")) raw = JSON.parse(line.slice("|request|".length));
      else if (line.startsWith("|error|")) this.receiveError();
      else applyLine(this.view, line, this.side, this.lookups);
    }
    if (raw && this.view.winner === null) this.receiveRequest(raw as never);
  }

  /** Writing to a stream the battle has already closed throws; by then there is nothing left to decide. */
  choose(choice: string) {
    if (this.view.winner !== null) return;
    try {
      super.choose(choice);
    } catch {
      /* the battle ended while the decision was being made */
    }
  }

  receiveError() {
    // A choice the simulator refused (should not happen): let it pick for us rather than stall the battle.
    if (++this.errors > 20) return;
    this.choose("default");
  }

  receiveRequest(raw: never) {
    // The log for this turn may still be in flight in a second chunk; decide once everything already queued has been read.
    setTimeout(() => this.decide(parseRequest(raw)), 0);
  }

  private decide(request: ParsedRequest) {
    if (request.wait) return;
    if (request.teamPreview) return this.choose(this.chooseLead(request));
    syncRequest(this.view, this.side, request, this.lookups);
    const choice = this.difficulty === "easy" ? this.chooseRandom(request) : this.chooseSmart(request);
    this.choose(choice);
  }

  // ---- Team Preview: the lead ---------------------------------------------------------------------------------------

  /**
   * Easy leads with a random Pokémon. Normal looks at the six it can see across the field (species and typing only, as a player could):
   * a lead scores for the best hit its moves' types make on each of them, less the best hit each of their types makes on it.
   * The rest of the team keeps its order (the simulator fills it in from the lead alone).
   */
  private chooseLead(request: ParsedRequest): string {
    const count = request.team.length;
    if (count <= 1) return "default";
    const foes = this.view.sides[otherSide(this.side)].preview;
    if (this.difficulty === "easy" || foes.length === 0) return `team ${1 + Math.floor(this.random() * count)}`;
    const math = this.matchup.math;
    let best = 1;
    let bestScore = -Infinity;
    request.team.forEach((member, i) => {
      const mine = this.lookups.species(member.species).types;
      const attacks = this.damagingTypes(member.moves);
      let score = 0;
      for (const foe of foes) {
        score += Math.max(0, ...attacks.map((type) => math.multiplier(type, foe.types)));
        score -= Math.max(0, ...foe.types.map((type) => math.multiplier(type, mine)));
      }
      score += this.random() * 0.01; // break ties without always favouring the first
      if (score > bestScore) {
        bestScore = score;
        best = i + 1;
      }
    });
    return `team ${best}`;
  }

  // ---- Easy: any legal move, now and then a switch -----------------------------------------------------------------

  private benchSlots(request: ParsedRequest): number[] {
    // Revival Blessing wants a fainted Pokémon; any other switch wants a healthy one.
    return request.team.flatMap((p, i) => (!p.active && (request.reviving ? p.fainted : !p.fainted) ? [i + 1] : []));
  }

  private pick<T>(items: T[]): T {
    return items[Math.floor(this.random() * items.length)];
  }

  private chooseRandom(request: ParsedRequest): string {
    const bench = this.benchSlots(request);
    if (request.forceSwitch || !request.active) return bench.length ? `switch ${this.pick(bench)}` : "default";
    const usable = request.active.moves.map((m, i) => (m.disabled || m.pp === 0 ? 0 : i + 1)).filter(Boolean);
    if (bench.length && !request.active.trapped && (usable.length === 0 || this.random() < 0.08)) return `switch ${this.pick(bench)}`;
    if (!usable.length) return "move 1";
    return this.withSpecial(request.active, this.pick(usable), 0.3, 0.3, 0.3);
  }

  // ---- Normal: best expected damage, avoids immunities, sometimes leaves a bad matchup --------------------------------

  private chooseSmart(request: ParsedRequest): string {
    const dex = this.dex;
    const foe = activeMon(this.view, otherSide(this.side));
    const bench = request.team.flatMap((p, i): (BenchOption & { slot: number })[] => {
      if (p.active || (request.reviving ? !p.fainted : p.fainted)) return [];
      return [{ slot: i + 1, types: this.lookups.species(p.species).types, moveTypes: this.damagingTypes(p.moves), hpFraction: p.hp / p.maxHp }];
    });
    const foeInfo = foe ? { types: foe.types } : null;

    if (request.forceSwitch || !request.active) {
      if (!bench.length) return "default";
      const pick = foeInfo ? bestSwitch(bench, foeInfo, null, this.matchup.math) : null;
      return `switch ${(pick ?? this.pick(bench)).slot}`;
    }

    const options = request.active;
    const me = request.team.find((p) => p.active);
    const meView = activeMon(this.view, this.side);
    if (!me || !meView || !foe) return this.chooseRandom(request);

    const meFacts: FighterFacts = {
      types: meView.types,
      hpFraction: meView.maxHp ? meView.hp / meView.maxHp : 1,
      status: meView.status,
      boostLevels: Object.values(meView.boosts).reduce((n, v) => n + Math.max(0, v), 0),
      atk: me.stats?.atk,
      spa: me.stats?.spa,
      ignoresAbilities: ["moldbreaker", "teravolt", "turboblaze"].includes(toId(me.ability ?? "")),
    };
    // The foe's ability counts only once the battle has shown it (Levitate after a Ground move failed, Flash Fire after it absorbed one).
    const foeFacts: FighterFacts = { types: foe.types, hpFraction: foe.maxHp ? foe.hp / foe.maxHp : 1, status: foe.status, boostLevels: 0, ability: foe.ability };
    const foeConditions = this.view.sides[otherSide(this.side)].conditions.map(toId);

    // Leave a bad matchup now and then (never twice in a row, never when trapped).
    const moveTypes = this.damagingTypes(options.moves.map((m) => m.id));
    if (bench.length && !options.trapped && this.view.turn - this.lastSwitchTurn >= 3 && isBadMatchup({ types: meView.types, moveTypes }, foeInfo!, this.matchup.math) && this.random() < 0.4) {
      const target = bestSwitch(bench, foeInfo!, matchupScore({ types: meView.types, moveTypes }, foeInfo!, this.matchup.math), this.matchup.math);
      if (target) {
        this.lastSwitchTurn = this.view.turn;
        return `switch ${target.slot}`;
      }
    }

    const scored = options.moves
      .map((m, i) => ({ slot: i + 1, score: m.disabled || m.pp === 0 ? NO_GOOD_MOVE * 2 : scoreMove(moveFacts(dex, m.id), meFacts, foeFacts, foeConditions, this.view.turn, this.matchup) }))
      .sort((a, b) => b.score - a.score);
    if (!scored.length) return "move 1";
    let chosen = scored[0];
    // Not perfectly predictable: occasionally the runner-up when it is nearly as good.
    if (scored[1] && scored[1].score > 0 && scored[1].score > chosen.score * 0.6 && this.random() < 0.2) chosen = scored[1];
    const attacking = moveFacts(dex, options.moves[chosen.slot - 1].id).category !== "Status";
    return this.withSpecial(options, chosen.slot, attacking ? 0.35 : 0, 0.45, 1);
  }

  private damagingTypes(moveIds: string[]): string[] {
    const types = new Set<string>();
    for (const id of moveIds) {
      const m = this.dex.moves.get(id);
      if (m.exists && m.category !== "Status") types.add(m.type.toLowerCase());
    }
    return [...types];
  }

  /** Adds Mega Evolution, a Z-Move, Dynamax or Terastallization to a move choice, with the given chances. */
  private withSpecial(options: ActiveOptions, slot: number, teraChance: number, dynamaxChance: number, zChance: number): string {
    const base = `move ${slot}`;
    if (options.canMega) return `${base} mega`;
    if (options.canUltra) return `${base} ultra`;
    if (options.zMoves[slot - 1] && this.random() < zChance) return `${base} zmove`;
    if (options.canDynamax && this.random() < dynamaxChance) return `${base} dynamax`;
    if (options.canTera && this.random() < teraChance) return `${base} terastallize`;
    return base;
  }
}
