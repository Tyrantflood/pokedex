// Builds lib/battle/recommended-teams.generated.json: the "Recommended teams" shown in the battler.
//
// Source: Smogon's published sample teams (the teams posted in Smogon's Sample Teams forums, with the names and authors their posters gave them),
// as collected by the pkmn/smogon project (https://github.com/pkmn/smogon, code MIT) and served from pkmn.github.io/smogon/data/teams/.
// Nothing here is invented: every team is a published one. What this script adds is (a) a check against the simulator's own team validator for the
// format it is offered in (anything the current rules reject is dropped), (b) a playstyle tag and a one-line description worked out from the team's
// own moves, abilities and types (lib/battle/team-style.ts), and (c) the choice of at most 20 per format, by that module's synergy score.
//
// Run:  npm run teams:build        (needs network; the output is committed, the app never fetches anything)
import { writeFile } from "node:fs/promises";
import { Dex, Teams, TeamValidator } from "@pkmn/sim";
import { FORMATS } from "../lib/battle/formats.ts";
import { normalizeSet } from "../lib/battle/my-teams.ts";
import { spriteIdFor } from "../lib/battle/ids.ts";
import { describeTeam } from "../lib/battle/team-style.ts";

const BASE = "https://pkmn.github.io/smogon/data/teams";
const MAX_PER_FORMAT = 20;
const OUT = new URL("../lib/battle/recommended-teams.generated.json", import.meta.url);

/** Our format key -> the pkmn/smogon data file. */
const SOURCES = {
  "team-natdex": "gen9nationaldex",
  "team-ag": "gen9anythinggoes",
  ...Object.fromEntries([1, 2, 3, 4, 5, 6, 7, 8, 9].map((gen) => [`team-gen${gen}ou`, `gen${gen}ou`])),
};

/** A set without its defaults (zero EVs, 31 IVs, empty fields): `normalizeSet` puts them back when the file is read. */
function compact(set) {
  const evs = Object.fromEntries(Object.entries(set.evs).filter(([, v]) => v > 0));
  const ivs = Object.fromEntries(Object.entries(set.ivs).filter(([, v]) => v !== 31));
  const out = { species: set.species, item: set.item, ability: set.ability, moves: set.moves, nature: set.nature };
  if (Object.keys(evs).length) out.evs = evs;
  if (Object.keys(ivs).length) out.ivs = ivs;
  if (set.gender) out.gender = set.gender;
  if (set.level !== 100) out.level = set.level;
  if (set.teraType) out.teraType = set.teraType;
  if (set.hpType) out.hpType = set.hpType;
  return out;
}

const clean = (text, max) => String(text ?? "").replace(/[\u0000-\u001f\u007f|]/g, "").replace(/\s+/g, " ").trim().slice(0, max);
const slug = (text) => clean(text, 60).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "team";

async function fetchJson(url) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`${response.status}`);
      return await response.json();
    } catch (error) {
      if (attempt === 3) throw new Error(`${url}: ${error.message}`);
      await new Promise((r) => setTimeout(r, 1500 * attempt));
    }
  }
}

const result = { source: { name: "Smogon sample teams", via: "https://github.com/pkmn/smogon", note: "Teams are published by Smogon's forum members; names and authors are theirs." }, formats: {} };

for (const format of FORMATS.filter((f) => f.custom)) {
  const file = SOURCES[format.key];
  if (!file) throw new Error(`no source for ${format.key}`);
  const raw = await fetchJson(`${BASE}/${file}.json`);
  const dex = Dex.forFormat(format.formatId.split("@@@")[0]);
  const validator = TeamValidator.get(format.formatId);
  const dropped = {};
  const seen = new Set();
  const candidates = [];

  for (const entry of raw) {
    const author = clean(entry.author, 40);
    const title = clean(entry.name, 60);
    // Gens 1-2 samples list no EVs, or only the stats someone zeroed on purpose: in those generations every other stat is maxed.
    const maxed = { hp: 252, atk: 252, def: 252, spa: 252, spd: 252, spe: 252 };
    const sets = (entry.data ?? []).map((s) => normalizeSet(format.gen <= 2 ? { ...s, evs: { ...maxed, ...s.evs } } : s));
    if (sets.length < 1 || sets.length > 6 || sets.some((s) => !s)) {
      dropped.malformed = (dropped.malformed ?? 0) + 1;
      continue;
    }
    const errors = validator.validateTeam(Teams.unpack(Teams.pack(sets)));
    if (errors) {
      const reason = errors[0].replace(/^\S+(\s\S+)*? (has|is|and|'s|can't)/, "$2").slice(0, 60);
      dropped[reason] = (dropped[reason] ?? 0) + 1;
      continue;
    }
    const key = sets.map((s) => `${s.species}/${s.item}/${s.moves.join(",")}`).join("|");
    if (seen.has(key)) {
      dropped.duplicate = (dropped.duplicate ?? 0) + 1;
      continue;
    }
    seen.add(key);
    const style = describeTeam(dex, sets);
    // The post's own title is kept for the credit line (not when it was only "Untitled 3" or "Guest 2"); the display name is made from the team's core.
    const untitled = !title || /^(untitled|guest) ?\d*$/i.test(title);
    candidates.push({ title: untitled ? null : title, author: author || "unknown", sets, ...style });
  }

  // Two teams can come out with the same display name. The later one is told apart by its next most imposing Pokémon ("Mega Latias Stall + Gliscor"),
  // and only if that is taken too by a number ("... II").
  const used = new Map();
  const numbered = (name, core) => {
    if (!used.has(name)) return used.set(name, 1), name;
    for (const extra of core) {
      if (name.includes(extra)) continue;
      const alt = `${name} + ${extra}`;
      if (!used.has(alt)) return used.set(alt, 1), alt;
    }
    const n = used.get(name) + 1;
    used.set(name, n);
    return `${name} ${["", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"][n - 1] ?? n}`;
  };

  // Best synergy first; ties keep the order the teams were published in.
  const chosen = candidates
    .map((c, index) => ({ c, index }))
    .sort((a, b) => b.c.score - a.c.score || a.index - b.index)
    .slice(0, MAX_PER_FORMAT)
    .map(({ c }, i) => ({ c, display: numbered(c.name, c.core), i }))
    .map(({ c, display, i }) => ({
      id: `${format.key}-${i + 1}-${slug(display)}`.slice(0, 60),
      name: display,
      title: c.title,
      author: c.author,
      tag: c.tag,
      why: c.why,
      icons: c.sets.map((s) => {
        const species = dex.species.get(s.species);
        return spriteIdFor(species.id, species.num);
      }),
      sets: c.sets.map(compact),
    }));

  result.formats[format.key] = { formatId: format.formatId, sourceFile: `${file}.json`, published: raw.length, valid: candidates.length, dropped, teams: chosen };
  console.log(`${format.key.padEnd(14)} published ${String(raw.length).padStart(3)}  valid ${String(candidates.length).padStart(3)}  offered ${String(chosen.length).padStart(2)}  dropped ${JSON.stringify(dropped)}`);
}

// One team per line, so a refresh shows up as a readable diff.
const lines = ["{", `"source": ${JSON.stringify(result.source)},`, '"formats": {'];
const keys = Object.keys(result.formats);
keys.forEach((key, i) => {
  const { teams, ...rest } = result.formats[key];
  lines.push(`${JSON.stringify(key)}: {${JSON.stringify(rest).slice(1, -1)},`, '"teams": [');
  teams.forEach((team, j) => lines.push(JSON.stringify(team) + (j < teams.length - 1 ? "," : "")));
  lines.push("]}" + (i < keys.length - 1 ? "," : ""));
});
lines.push("}", "}");
await writeFile(OUT, lines.join("\n") + "\n", "utf8");
console.log("wrote", OUT.pathname);
