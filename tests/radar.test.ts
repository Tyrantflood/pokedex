import assert from "node:assert/strict";
import test from "node:test";
import { RADAR_AXES, radarMax, radarPoint, radarPolygon } from "../lib/radar";

const stats = { hp: 78, attack: 84, defense: 78, specialAttack: 109, specialDefense: 85, speed: 100 };
const other = { hp: 80, attack: 82, defense: 83, specialAttack: 100, specialDefense: 100, speed: 80 };
const CX = 160;
const CY = 150;
const R = 100;
const points = (polygon: string) => polygon.split(" ").map((p) => p.split(",").map(Number));

test("the scale is the top stat rounded up to a multiple of 10, and at least 100", () => {
  assert.equal(radarMax(stats, other), 110);
  const low = { hp: 10, attack: 10, defense: 10, specialAttack: 10, specialDefense: 10, speed: 10 };
  assert.equal(radarMax(low, { ...low, hp: 20, attack: 5, defense: 5, specialAttack: 5, specialDefense: 5, speed: 5 }), 100);
});

test("at progress 0 the polygon collapses to the centre", () => {
  assert.ok(points(radarPolygon(stats, 110, 0, CX, CY, R)).every(([x, y]) => Math.abs(x - CX) < 0.01 && Math.abs(y - CY) < 0.01));
});

test("at progress 1 each vertex is as far from the centre as its stat says", () => {
  const polygon = points(radarPolygon(stats, 110, 1, CX, CY, R));
  RADAR_AXES.forEach(({ key }, i) => {
    const distance = Math.hypot(polygon[i][0] - CX, polygon[i][1] - CY);
    assert.ok(Math.abs(distance - (stats[key] / 110) * R) < 0.02, `${key}: vertex distance is proportional to the stat`);
  });
});

test("the first axis (HP) points straight up", () => {
  const [x, y] = radarPoint(0, 1, CX, CY, R);
  assert.ok(Math.abs(x - CX) < 1e-9);
  assert.ok(Math.abs(y - (CY - R)) < 1e-9);
});
