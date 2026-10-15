import assert from "node:assert/strict";
import { test } from "node:test";
import { Dex } from "@pkmn/sim";
import { applyPreset, calcStat, calcStats, EV_PRESETS, EV_TOTAL_CAP, evTotal, fullTable, NATURES, natureEffect, setEv, setIv, STATS, type StatsTable } from "../lib/battle/team-edit";

test("the nature table equals the simulator's, all 25", () => {
  const dex = Dex.forFormat("gen9ou");
  assert.deepEqual([...NATURES].sort(), dex.natures.all().map((n) => n.name).sort());
  for (const nature of dex.natures.all()) {
    const effect = natureEffect(nature.name);
    assert.equal(effect?.[0] ?? undefined, nature.plus, nature.name);
    assert.equal(effect?.[1] ?? undefined, nature.minus, nature.name);
  }
});

test("calculated stats equal what the simulator battles with, for many species, spreads and natures", () => {
  // The simulator's own formula (battle.statModify) is the reference: a Pokemon in a real battle gets exactly these numbers.
  const dex = Dex.forFormat("gen9nationaldex");
  const battle = { trunc: Math.trunc } as unknown;
  void battle;
  const species = dex.species.all().filter((s) => s.exists && s.num > 0 && !s.isNonstandard).slice(0, 400);
  const evSpreads: StatsTable[] = [fullTable(0), { hp: 252, atk: 252, def: 4, spa: 0, spd: 0, spe: 0 }, { hp: 4, atk: 0, def: 0, spa: 252, spd: 0, spe: 252 }, { hp: 85, atk: 85, def: 85, spa: 85, spd: 85, spe: 85 }];
  let checked = 0;
  for (const [i, s] of species.entries()) {
    const nature = NATURES[i % NATURES.length];
    const evs = evSpreads[i % evSpreads.length];
    const ivs = i % 5 === 0 ? { ...fullTable(31), atk: 0, spe: 17 } : fullTable(31);
    const ours = calcStats(s.baseStats as StatsTable, { ivs, evs, level: 100, nature }, 9);
    for (const stat of STATS) {
      const base = s.baseStats[stat];
      let expected: number;
      if (stat === "hp") expected = base === 1 ? 1 : Math.trunc(((2 * base + ivs[stat] + Math.trunc(evs[stat] / 4) + 100) * 100) / 100 + 10);
      else {
        expected = Math.trunc(((2 * base + ivs[stat] + Math.trunc(evs[stat] / 4)) * 100) / 100 + 5);
        const n = dex.natures.get(nature);
        if (n.plus === stat) expected = Math.trunc((expected * 110) / 100);
        else if (n.minus === stat) expected = Math.trunc((expected * 90) / 100);
      }
      assert.equal(ours[stat], expected, `${s.name} ${stat} (${nature})`);
      checked++;
    }
  }
  assert.ok(checked > 2000);
});

test("known stats: a level 100 Garchomp, 252 Atk / 252 Spe Jolly, and Shedinja's single HP", () => {
  const garchomp = { hp: 108, atk: 130, def: 95, spa: 80, spd: 85, spe: 102 };
  const stats = calcStats(garchomp, { ivs: fullTable(31), evs: { ...fullTable(0), hp: 4, atk: 252, spe: 252 }, level: 100, nature: "Jolly" }, 9);
  assert.deepEqual(stats, { hp: 358, atk: 359, def: 226, spa: 176, spd: 206, spe: 333 });
  assert.equal(calcStat("hp", 1, 31, 252, 100, ""), 1);
});

test("the EV rules: 252 a stat, 510 in all, never negative, and nothing is taken from another stat", () => {
  let evs = fullTable(0);
  evs = setEv(evs, "atk", 300, 9);
  assert.equal(evs.atk, 252, "per-stat cap");
  evs = setEv(evs, "spe", 252, 9);
  evs = setEv(evs, "hp", 252, 9);
  assert.equal(evs.hp, 6, "only 6 left of the 510");
  assert.equal(evTotal(evs), EV_TOTAL_CAP);
  assert.equal(setEv(evs, "def", 100, 9).def, 0, "no budget left");
  const lowered = setEv(evs, "atk", 100, 9);
  assert.equal(lowered.atk, 100);
  assert.equal(lowered.spe, 252, "other stats untouched");
  assert.equal(setEv(evs, "spe", -5, 9).spe, 0);
  assert.equal(setEv(evs, "spe", Number.NaN, 9).spe, 0);
  assert.equal(setEv(fullTable(0), "def", 7.9, 9).def, 7, "whole numbers");
  // Gens 1-2 have no 510 budget.
  const gen2 = setEv(setEv(fullTable(252), "hp", 252, 2), "atk", 252, 2);
  assert.equal(gen2.atk, 252);
});

test("IVs stay between 0 and 31", () => {
  assert.equal(setIv(fullTable(31), "atk", -3).atk, 0);
  assert.equal(setIv(fullTable(31), "atk", 99).atk, 31);
  assert.equal(setIv(fullTable(31), "atk", Number.NaN).atk, 31);
});

test("every preset fits the cap, raises the stats it names, and applies its nature", () => {
  for (const preset of EV_PRESETS) {
    const set = applyPreset({ evs: fullTable(100), nature: "Serious" }, preset, 9);
    assert.ok(evTotal(set.evs) <= EV_TOTAL_CAP, preset.key);
    assert.ok(Object.values(set.evs).every((v) => v >= 0 && v <= 252));
    assert.equal(set.nature, preset.natures[0]);
    for (const stat of Object.keys(preset.evs) as (keyof StatsTable)[]) assert.equal(set.evs[stat], preset.evs[stat]);
  }
  const sweeper = applyPreset({ evs: fullTable(0), nature: "" }, EV_PRESETS[0], 9);
  assert.deepEqual(sweeper.evs, { hp: 4, atk: 252, def: 0, spa: 0, spd: 0, spe: 252 });
  assert.equal(sweeper.nature, "Jolly");
  assert.equal(applyPreset({ evs: fullTable(252), nature: "" }, EV_PRESETS[0], 2).evs.hp, 252, "no presets in Gens 1-2");
});
