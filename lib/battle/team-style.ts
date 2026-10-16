/**
 * What kind of team a set of six is, worked out from its own moves, abilities, items and types (never from anyone's prose): a playstyle
 * tag, a one-line "why it works", and a synergy score used to choose among many candidates. Used by the script that builds the recommended
 * teams, and tested against the simulator. Pure apart from reading the (type-only) Dex it is given.
 *
 * These are heuristics, and the interface says so: the line is a description of what is on the team, not Smogon's opinion.
 */
import type { PokemonSet } from "@pkmn/sets";
import type { ModdedDex } from "@pkmn/sim";
import { dexTypeMath } from "./dex-facts";

export type Playstyle = "Offense" | "Bulky offense" | "Balance" | "Stall" | "Weather" | "Trick Room";

export interface TeamStyle {
  tag: Playstyle;
  /** A short display name from the team's core ("Politoed Rain", "Mega Charizard X Offense", "Gliscor Alomomola Balance"). Not unique: the caller numbers repeats. */
  name: string;
  /** The team's Pokémon, most imposing first: what a repeated display name can be told apart by. */
  core: string[];
  /** One sentence, built from facts about the team. */
  why: string;
  /** Higher is better; only meaningful for comparing teams of the same format. */
  score: number;
  /** The most Pokémon any one attacking type hits super effectively. */
  worstShared: number;
}

const ATTACK_TYPES = ["Normal", "Fire", "Water", "Electric", "Grass", "Ice", "Fighting", "Poison", "Ground", "Flying", "Psychic", "Bug", "Rock", "Ghost", "Dragon", "Dark", "Steel", "Fairy"];

const WEATHER_ABILITIES: Record<string, string> = {
  drought: "sun", orichalcumpulse: "sun", desolateland: "harsh sun",
  drizzle: "rain", primordialsea: "heavy rain",
  sandstream: "sandstorm", snowwarning: "snow", deltastream: "strong winds",
};
const WEATHER_MOVES: Record<string, string> = { raindance: "rain", sunnyday: "sun", sandstorm: "sandstorm", hail: "hail", snowscape: "snow", chillyreception: "snow" };
const WEATHER_TYPE: Record<string, string> = { sun: "Fire", "harsh sun": "Fire", rain: "Water", "heavy rain": "Water" };
const WEATHER_PAYOFF = new Set([
  "swiftswim", "chlorophyll", "sandrush", "slushrush", "sandforce", "solarpower", "protosynthesis", "leafguard", "flowergift", "raindish", "icebody", "hydration", "dryskin", "sandveil", "snowcloak", "forecast",
]);
const RECOVERY_IDS = new Set(["wish", "rest", "strengthsap", "lifedew", "junglehealing", "shoreup", "synthesis", "moonlight", "morningsun"]);
const HAZARDS = new Set(["stealthrock", "spikes", "toxicspikes", "stickyweb"]);
const REMOVAL = new Set(["defog", "rapidspin", "courtchange", "mortalspin", "tidyup"]);
const SPEED_CONTROL = new Set(["thunderwave", "tailwind", "icywind", "electroweb", "stickyweb", "glare", "trickroom", "bulldoze", "stringshot", "scaryface"]);
const SETUP_EXTRA = new Set(["bellydrum", "shellsmash", "clangoroussoul", "filletaway", "shiftgear"]);

interface MemberFacts {
  name: string;
  types: string[];
  baseSpe: number;
  /** Base stat total: the more imposing Pokémon tend to be the team's identity. */
  bst: number;
  /** The Mega forme this member's stone gives it ("Charizard-Mega-X"), if it holds one. */
  mega: string | null;
  moves: ReturnType<ModdedDex["moves"]["get"]>[];
  ability: string;
  item: string;
}

/** The Mega forme a stone gives (the simulator stores it as { Base: "Base-Mega" }, older data as a string). */
function megaFormeOf(stone: unknown): string | null {
  if (typeof stone === "string") return stone;
  if (stone && typeof stone === "object") return Object.values(stone as Record<string, string>)[0] ?? null;
  return null;
}

/** "Charizard-Mega-X" -> "Mega Charizard X". */
export function megaDisplay(forme: string): string {
  const match = /^(.*?)-Mega(?:-(.+))?$/.exec(forme);
  return match ? `Mega ${match[1]}${match[2] ? ` ${match[2]}` : ""}` : forme;
}

const WEATHER_NOUN: Record<string, string> = { sun: "Sun", "harsh sun": "Sun", rain: "Rain", "heavy rain": "Rain", sandstorm: "Sand", snow: "Snow", hail: "Hail", "strong winds": "Winds" };

function factsOf(dex: ModdedDex, sets: PokemonSet[]): MemberFacts[] {
  return sets.map((set) => {
    const species = dex.species.get(set.species);
    return {
      name: species.name,
      types: species.types,
      baseSpe: species.baseStats.spe,
      bst: species.bst,
      mega: megaFormeOf(dex.items.get(set.item).megaStone),
      moves: set.moves.map((m) => dex.moves.get(m)),
      ability: dex.abilities.get(set.ability).id,
      item: dex.items.get(set.item).id,
    };
  });
}

const has = (member: MemberFacts, ids: Set<string>) => member.moves.some((m) => ids.has(m.id));
const isRecovery = (m: MemberFacts["moves"][number]) => !!m.heal || RECOVERY_IDS.has(m.id);
const isSetup = (m: MemberFacts["moves"][number]) => SETUP_EXTRA.has(m.id) || (m.category === "Status" && m.target === "self" && !!m.boosts && (m.boosts.atk! > 0 || m.boosts.spa! > 0 || m.boosts.spe! > 0));
const isPivot = (m: MemberFacts["moves"][number]) => !!m.selfSwitch;
const names = (members: MemberFacts[], max = 3) => {
  const list = members.slice(0, max).map((m) => m.name);
  return list.length <= 1 ? (list[0] ?? "") : `${list.slice(0, -1).join(", ")} and ${list[list.length - 1]}`;
};

/** The playstyle, the "why", and a synergy score for one team. */
export function describeTeam(dex: ModdedDex, sets: PokemonSet[]): TeamStyle {
  const team = factsOf(dex, sets);
  const math = dexTypeMath(dex);

  // Type exposure with the generation's own chart.
  let worstShared = 0;
  let worstType = "";
  let penalty = 0;
  const open: string[] = [];
  for (const type of ATTACK_TYPES) {
    if (!dex.types.get(type).exists) continue;
    const multipliers = team.map((m) => math.multiplier(type.toLowerCase(), m.types.map((t) => t.toLowerCase())));
    const weak = multipliers.filter((x) => x > 1).length;
    const answers = multipliers.filter((x) => x < 1).length;
    if (weak > worstShared) {
      worstShared = weak;
      worstType = type;
    }
    if (weak >= 3) penalty += (weak - 2) * 6;
    if (weak > answers) penalty += 2;
    if (weak > 0 && answers === 0) open.push(type);
  }

  const recoverers = team.filter((m) => m.moves.some(isRecovery));
  const setupUsers = team.filter((m) => m.moves.some(isSetup));
  const hazardSetters = team.filter((m) => has(m, HAZARDS));
  const removers = team.filter((m) => has(m, REMOVAL));
  const pivots = team.filter((m) => m.moves.some(isPivot));
  const speedControl = team.filter((m) => has(m, SPEED_CONTROL) || m.item === "choicescarf");
  const fastAttackers = team.filter((m) => m.baseSpe >= 100 && m.moves.some((mv) => mv.category !== "Status"));
  const statusMoves = team.reduce((sum, m) => sum + m.moves.filter((mv) => mv.category === "Status").length, 0);

  // Weather: a setter, and somebody who is better for it.
  let weatherName = "";
  let setter: MemberFacts | undefined;
  for (const m of team) {
    const fromAbility = WEATHER_ABILITIES[m.ability];
    const fromMove = m.moves.map((mv) => WEATHER_MOVES[mv.id]).find(Boolean);
    if (fromAbility || fromMove) {
      weatherName = fromAbility ?? fromMove!;
      setter = m;
      break;
    }
  }
  const payoff = setter
    ? team.filter((m) => m !== setter && (WEATHER_PAYOFF.has(m.ability) || (WEATHER_TYPE[weatherName] && m.moves.some((mv) => mv.category !== "Status" && mv.type === WEATHER_TYPE[weatherName]))))
    : [];

  const trickRoomer = team.find((m) => m.moves.some((mv) => mv.id === "trickroom"));
  const slowAttackers = team.filter((m) => m.baseSpe <= 60 && m.moves.some((mv) => mv.category !== "Status"));

  let tag: Playstyle;
  if (setter && payoff.length >= 1) tag = "Weather";
  else if (trickRoomer && slowAttackers.length >= 2) tag = "Trick Room";
  else if (recoverers.length >= 3 && setupUsers.length <= 1 && statusMoves >= 8) tag = "Stall";
  else if (recoverers.length <= 1 && (setupUsers.length >= 2 || fastAttackers.length >= 3)) tag = "Offense";
  else if (setupUsers.length >= 2 && recoverers.length >= 2) tag = "Bulky offense";
  else tag = "Balance";

  // The sentence: how the team plays, one useful extra, then what it does about types.
  const some = (members: MemberFacts[], verb: string) => (members.length === 1 ? `${verb}s` : verb);
  const others = (members: MemberFacts[], not: MemberFacts[]) => members.filter((m) => !not.includes(m));
  let how: string;
  switch (tag) {
    case "Weather":
      how = `${setter!.name} brings ${weatherName}, which boosts ${names(payoff)}`;
      break;
    case "Trick Room": {
      const slow = others(slowAttackers, [trickRoomer!]);
      how = `${trickRoomer!.name} sets Trick Room so slow hitters like ${names(slow)} move first`;
      break;
    }
    case "Stall":
      how = `${names(recoverers, 4)} heal off damage while ${statusMoves} status moves${hazardSetters.length ? " and entry hazards" : ""} wear the opponent down`;
      break;
    case "Offense":
      how = setupUsers.length
        ? `${names(setupUsers)} ${some(setupUsers, "boost")} with setup moves${hazardSetters.length ? ` once ${names(hazardSetters, 2)} ${hazardSetters.length === 1 ? "has" : "have"} chipped the opponent with hazards` : ""}`
        : `${fastAttackers.length} fast attackers (${names(fastAttackers)}) hit before the opponent can react`;
      break;
    case "Bulky offense": {
      const sturdy = others(recoverers, setupUsers);
      how = `${names(setupUsers)} set${setupUsers.length === 1 ? "s" : ""} up while ${names(sturdy.length ? sturdy : recoverers, 2)} can heal off the hits`;
      break;
    }
    default: {
      const sturdy = others(recoverers, pivots);
      how = pivots.length
        ? `${names(pivots)} keep${pivots.length === 1 ? "s" : ""} the momentum with pivot moves${sturdy.length ? ` while ${names(sturdy, 2)} soak${sturdy.length === 1 ? "s" : ""} up hits` : ""}`
        : recoverers.length
          ? `a spread of attackers backed by recovery on ${names(recoverers, 2)}`
          : "a spread of attackers and sturdy defences that can adapt to what the opponent brings";
    }
  }
  const utility: string[] = [];
  if (removers.length) utility.push(`${names(removers, 2)} ${removers.length === 1 ? "clears" : "clear"} the opponent's hazards`);
  else if (hazardSetters.length && tag !== "Stall" && tag !== "Offense") utility.push(`${names(hazardSetters, 2)} set${hazardSetters.length === 1 ? "s" : ""} hazards`);
  if (speedControl.length && tag !== "Trick Room" && !utility.length) utility.push(`speed control from ${names(speedControl, 2)}`);
  const safety =
    worstShared <= 2
      ? `no type hits more than ${Math.max(worstShared, 1)} of its ${team.length} Pokémon super effectively`
      : `its most shared weakness is ${worstType}, which hits ${worstShared} of ${team.length}`;
  const sentence = [how, ...utility, safety].join("; ");
  const why = sentence.charAt(0).toUpperCase() + sentence.slice(1) + ".";

  // Score: type safety first, then the jobs a team needs done.
  let score = 100 - penalty;
  if (hazardSetters.length) score += 4;
  if (removers.length) score += 4;
  if (pivots.length) score += 3;
  if (speedControl.length) score += 3;
  if (recoverers.length) score += 2;
  score -= open.length * 1.5;

  // The display name, from the team's core: its weather, its Trick Room, its Mega, its pivoting, else its two most imposing Pokémon.
  const tagWord: Record<Playstyle, string> = { Offense: "Offense", "Bulky offense": "Bulky Offense", Balance: "Balance", Stall: "Stall", Weather: "Weather", "Trick Room": "Trick Room" };
  const byPresence = [...team].sort((a, b) => b.bst + (b.moves.some(isSetup) ? 40 : 0) - (a.bst + (a.moves.some(isSetup) ? 40 : 0)));
  const mega = team.find((m) => m.mega);
  const voltTurn = team.some((m) => has(m, new Set(["voltswitch"]))) && team.some((m) => has(m, new Set(["uturn", "flipturn"])));
  let name: string;
  if (tag === "Weather" && setter) name = `${setter.name} ${WEATHER_NOUN[weatherName] ?? "Weather"}`;
  else if (tag === "Trick Room" && trickRoomer) name = `${trickRoomer.name} Trick Room`;
  else if (mega) name = `${megaDisplay(mega.mega!)} ${tagWord[tag]}`;
  else if (voltTurn) name = `Volt-Turn ${(team.find((m) => has(m, new Set(["voltswitch"]))) ?? byPresence[0]).name}`;
  else if (tag === "Offense") name = `${(setupUsers.length ? [...setupUsers].sort((a, b) => b.bst - a.bst)[0] : byPresence[0]).name} Offense`;
  else if (tag === "Bulky offense") name = `Bulky ${(setupUsers.length ? [...setupUsers].sort((a, b) => b.bst - a.bst)[0] : byPresence[0]).name}`;
  else if (tag === "Stall") name = `${[...recoverers].sort((a, b) => b.bst - a.bst).slice(0, 2).map((m) => m.name).join(" ") || byPresence[0].name} Stall`;
  else name = `${byPresence.slice(0, 2).map((m) => m.name).join(" ")} Balance`;

  return { tag, name, core: byPresence.map((m) => m.name), why, score, worstShared };
}
