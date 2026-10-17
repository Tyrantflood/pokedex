import assert from "node:assert/strict";
import { test } from "node:test";
import { Dex } from "@pkmn/sim";
import { FILTER_TYPES } from "../lib/type-colors";
import { BANNER_MS, isBigHit, moveHoldMs, moveId, planMove, sequenceLines, seeded, STATE_FX, TYPE_FX, typeFx } from "../lib/battle/move-fx";
import { startLocalBattle } from "../lib/battle/engine";
import { FORMATS } from "../lib/battle/formats";
import { makeLookups } from "../lib/battle/dex-facts";
import { applyLine, createView, syncRequest } from "../lib/battle/protocol";

const plan = (name: string, category: string, selfTarget = false, type = "normal") => planMove({ name, type, category, selfTarget });

test("every move gets an animation by category, and the six iconic moves get their own", () => {
  assert.equal(plan("Tackle", "Physical").style, "lunge");
  assert.equal(plan("Ember", "Special", false, "fire").style, "projectile");
  assert.equal(plan("Ice Beam", "Special", false, "ice").style, "beam");
  assert.equal(plan("Flash Cannon", "Special", false, "steel").style, "beam");
  assert.equal(plan("Calm Mind", "Status", true, "psychic").style, "aura");
  assert.equal(plan("Toxic", "Status", false, "poison").style, "pulse");
  const iconic = { Earthquake: "earthquake", "Hyper Beam": "hyperbeam", Protect: "protect", Thunderbolt: "thunderbolt", Surf: "surf", "Swords Dance": "swordsdance" } as const;
  for (const [name, style] of Object.entries(iconic)) {
    // The category the simulator reports must not matter: an iconic move is chosen by name.
    for (const category of ["Physical", "Special", "Status"]) assert.equal(plan(name, category, true).style, style, `${name} as ${category}`);
  }
  assert.equal(moveId("Swords Dance"), "swordsdance");
  assert.equal(moveId("Will-O-Wisp"), "willowisp");
});

test("a move holds the log for its banner plus its attack, shorter for reduced motion, and every style has a length", () => {
  const styles = ["lunge", "projectile", "beam", "aura", "pulse", "earthquake", "hyperbeam", "protect", "thunderbolt", "surf", "swordsdance"] as const;
  const seen = new Set<string>();
  for (const name of ["Tackle", "Ember", "Ice Beam", "Calm Mind", "Toxic", "Earthquake", "Hyper Beam", "Protect", "Thunderbolt", "Surf", "Swords Dance"]) {
    const fx = plan(name, name === "Tackle" ? "Physical" : name === "Ember" || name === "Ice Beam" ? "Special" : "Status", name !== "Toxic");
    seen.add(fx.style);
    assert.ok(fx.durationMs >= 400 && fx.durationMs <= 1600);
    assert.equal(moveHoldMs(fx, false), BANNER_MS + fx.durationMs);
    assert.equal(moveHoldMs(fx, true), 650, "reduced motion: just long enough to read the banner");
  }
  assert.deepEqual([...seen].sort(), [...styles].sort(), "all eleven styles are reachable");
  assert.ok(plan("Hyper Beam", "Special").durationMs > plan("Tackle", "Physical").durationMs, "the big move takes longer");
});

test("all 18 types have their own look: a different shape and motion each, with two colours and a sane particle count", () => {
  assert.equal(FILTER_TYPES.length, 18);
  const signatures = new Set<string>();
  for (const type of FILTER_TYPES) {
    const fx = TYPE_FX[type];
    assert.ok(fx, `${type} has no effect`);
    signatures.add(`${fx.shape}/${fx.motion}`);
    assert.ok(fx.count >= 4 && fx.count <= 12, `${type}: ${fx.count} particles (keep it light for phones)`);
    assert.match(fx.colors[0], /^#[0-9a-f]{6}$/i);
    assert.match(fx.colors[1], /^#[0-9a-f]{6}$/i);
    assert.notEqual(fx.colors[0], fx.colors[1]);
  }
  assert.equal(signatures.size, 18, "two types share a shape and a motion");
  // The pieces the brief names: flames, splash, bolts, shards, leaves, wisps.
  assert.deepEqual([TYPE_FX.fire.shape, TYPE_FX.water.motion, TYPE_FX.electric.shape, TYPE_FX.ice.shape, TYPE_FX.grass.shape, TYPE_FX.ghost.shape], ["flame", "splash", "bolt", "shard", "leaf", "wisp"]);
  assert.equal(typeFx("stellar"), TYPE_FX.normal, "unknown types fall back to Normal");
  assert.ok(STATE_FX.heal && STATE_FX.boost && STATE_FX.unboost);
  assert.equal(typeFx("heal"), STATE_FX.heal);
});

test("big hits: a critical hit or a third of the HP", () => {
  assert.equal(isBigHit(29, false), false);
  assert.equal(isBigHit(30, false), true);
  assert.equal(isBigHit(5, true), true);
});

test("seeded scatter repeats", () => {
  const a = seeded(42);
  const b = seeded(42);
  assert.deepEqual([a(), a(), a()], [b(), b(), b()]);
  assert.notEqual(seeded(1)(), seeded(2)());
});

test("sequencing: the damage comes first, then the effectiveness text, and the hit carries its flags", () => {
  const lines = [
    "|move|p1a: A|Flamethrower|p2a: B",
    "|-crit|p2a: B",
    "|-supereffective|p2a: B",
    "|-damage|p2a: B|40/100",
    "|faint|p2a: B",
  ];
  const steps = sequenceLines(lines);
  assert.deepEqual(
    steps.map((s) => s.line),
    ["|move|p1a: A|Flamethrower|p2a: B", "|-damage|p2a: B|40/100", "|-crit|p2a: B", "|-supereffective|p2a: B", "|faint|p2a: B"],
  );
  assert.deepEqual(steps[1].hit, { crit: true, super: true, resisted: false });
  assert.equal(steps[0].hit, undefined);
  // Nothing is lost or invented, whatever the order.
  assert.deepEqual([...steps.map((s) => s.line)].sort(), [...lines].sort());
});

test("sequencing: a multi-hit move keeps each hit's text with that hit; text with no damage stays in place; recoil is not a hit", () => {
  const steps = sequenceLines([
    "|move|p1a: A|Double Kick|p2a: B",
    "|-resisted|p2a: B",
    "|-damage|p2a: B|90/100",
    "|-resisted|p2a: B",
    "|-damage|p2a: B|80/100",
    "|-hitcount|p2a: B|2",
    "|move|p2a: B|Tackle|p1a: A",
    "|-immune|p1a: A",
    "|-damage|p1a: A|50/100|[from] Recoil",
  ]);
  assert.deepEqual(
    steps.map((s) => s.line),
    [
      "|move|p1a: A|Double Kick|p2a: B",
      "|-damage|p2a: B|90/100",
      "|-resisted|p2a: B",
      "|-damage|p2a: B|80/100",
      "|-resisted|p2a: B",
      "|-hitcount|p2a: B|2",
      "|move|p2a: B|Tackle|p1a: A",
      "|-immune|p1a: A",
      "|-damage|p1a: A|50/100|[from] Recoil",
    ],
  );
  assert.equal(steps[1].hit?.resisted, true);
  assert.equal(steps[3].hit?.resisted, true);
  assert.equal(steps[8].hit, undefined, "recoil is not a hit from a move");
});

test("move cues describe the move for the banner and the animation; damage cues say how much and from what; Protect blocks", () => {
  const view = createView();
  const lookups = makeLookups(Dex.forFormat("gen9nationaldex"));
  const feed = (line: string) => applyLine(view, line, "p1", lookups);
  feed("|switch|p1a: Charizard|Charizard, L80, M|100/100");
  feed("|switch|p2a: Venusaur|Venusaur, L80, M|100/100");
  const move = feed("|move|p1a: Charizard|Flamethrower|p2a: Venusaur").cue!;
  assert.equal(move.banner, "Charizard used Flamethrower!");
  assert.equal(move.moveCategory, "Special");
  assert.equal(move.moveType, "fire");
  assert.equal(move.selfTarget, false);
  const foe = feed("|move|p2a: Venusaur|Swords Dance|p2a: Venusaur").cue!;
  assert.equal(foe.banner, "The opposing Venusaur used Swords Dance!");
  assert.equal(foe.selfTarget, true);
  assert.equal(feed("|move|p2a: Venusaur|Stealth Rock|p1a: Charizard").cue!.selfTarget, false);
  assert.equal(feed("|move|p1a: Charizard|Rain Dance|p1a: Charizard").cue!.selfTarget, true);
  assert.equal(feed("|move|p1a: Charizard|Rain Dance").cue!.selfTarget, true, "no target at all: field moves");
  const hit = feed("|-damage|p2a: Venusaur|60/100").cue!;
  assert.equal(hit.amount, 40);
  assert.equal(hit.fromEffect, false);
  const recoil = feed("|-damage|p1a: Charizard|90/100|[from] Recoil").cue!;
  assert.equal(recoil.fromEffect, true);
  assert.equal(feed("|-activate|p2a: Venusaur|move: Protect").cue?.kind, "block");
  assert.equal(feed("|-activate|p2a: Venusaur|ability: Static").cue, undefined);
});

test("in real battles, no effectiveness text ever plays before the damage it belongs to", async () => {
  const format = FORMATS[0];
  const view = createView();
  let checkedHits = 0;
  let withText = 0;
  await new Promise<void>((resolve, reject) => {
    const battle = startLocalBattle({ format, difficulty: "normal", playerName: "Tester" }, (message) => {
      try {
        if (message.error) battle.choose("default");
        const steps = sequenceLines(message.lines);
        // Same lines, nothing added or dropped.
        assert.deepEqual(steps.map((s) => s.line).sort(), [...message.lines].sort());
        steps.forEach((step, i) => {
          if (step.line.startsWith("|-damage|") && step.hit) {
            checkedHits++;
            if (step.hit.crit || step.hit.super || step.hit.resisted) withText++;
          }
          if (/^\|-(crit|supereffective|resisted)\|/.test(step.line)) {
            // The invariant: the first line after a run of these is never the damage they describe (that one must come before them).
            let k = i + 1;
            while (k < steps.length && /^\|-(crit|supereffective|resisted)\|/.test(steps[k].line)) k++;
            const after = steps[k]?.line ?? "";
            // A multi-hit move ("-supereffective, -damage, -supereffective, -damage, -hitcount") correctly puts the first hit's text between the two
            // damages: that run is preceded by the damage it describes. Only a run with no damage before it that is followed by damage is wrong.
            let first = i;
            while (first > 0 && /^\|-(crit|supereffective|resisted)\|/.test(steps[first - 1].line)) first--;
            const before = steps[first - 1]?.line ?? "";
            const afterItsDamage = before.startsWith("|-damage|") && !before.includes("[from]");
            assert.ok(afterItsDamage || !(after.startsWith("|-damage|") && !after.includes("[from]")), `text before its damage: ${step.line} then ${after}`);
          }
        });
        for (const step of steps) applyLine(view, step.line, "p1", battle.lookups);
        if (view.winner !== null) {
          battle.destroy();
          return resolve();
        }
        const request = message.request;
        if (!request || request.wait) return;
        syncRequest(view, "p1", request, battle.lookups);
        if (request.forceSwitch || !request.active) {
          const slot = request.team.findIndex((p) => !p.active && (request.reviving ? p.fainted : !p.fainted));
          battle.choose(slot >= 0 ? `switch ${slot + 1}` : "default");
        } else {
          battle.choose(`move ${Math.max(1, request.active.moves.findIndex((m) => !m.disabled && m.pp !== 0) + 1)}`);
        }
      } catch (error) {
        battle.destroy();
        reject(error);
      }
    });
  });
  assert.ok(checkedHits > 10, "the battle had hits");
  assert.ok(withText > 0, "and some of them were crits or super effective/resisted");
});

test("a multi-hit move keeps each hit's text after that hit's damage (found when a random battle had Gear Grind hit twice)", () => {
  const lines = ["|move|p2a: Klinklang|Gear Grind|p1a: Armaldo", "|-supereffective|p1a: Armaldo", "|-damage|p1a: Armaldo|186/278", "|-supereffective|p1a: Armaldo", "|-damage|p1a: Armaldo|102/278", "|-hitcount|p1a: Armaldo|2"];
  const steps = sequenceLines(lines);
  assert.deepEqual(steps.map((s) => s.line), [lines[0], lines[2], lines[1], lines[4], lines[3], lines[5]]);
  assert.equal(steps[1].hit?.super, true);
  assert.equal(steps[3].hit?.super, true);
});
