import { test } from "node:test";
import assert from "node:assert/strict";
import { SafeZone, WEAPONS, reloadMagazine, applyDamage } from "./rules";

test("five distinct weapons with expected capacities and firing modes", () => {
  assert.deepEqual(
    WEAPONS.map((w) => w.mag),
    [15, 6, 60, 20, 5],
  );
  assert.equal(WEAPONS.filter((w) => w.auto).length, 1);
  assert.equal(WEAPONS[1].pellets, 8);
  assert.ok(WEAPONS[4].range > WEAPONS[0].range);
});
test("reload conserves ammunition and respects reserve", () => {
  assert.deepEqual(reloadMagazine(3, 7, 15), { loaded: 10, reserve: 0 });
  assert.deepEqual(reloadMagazine(10, 30, 15), { loaded: 15, reserve: 25 });
  assert.deepEqual(reloadMagazine(0, 0, 15), { loaded: 0, reserve: 0 });
});
test("armor absorbs damage, gas bypasses armor, health never goes negative", () => {
  assert.deepEqual(applyDamage(100, 50, 20), { health: 92, armor: 38 });
  assert.deepEqual(applyDamage(100, 50, 20, true), { health: 80, armor: 50 });
  assert.deepEqual(applyDamage(10, 0, 30), { health: 0, armor: 0 });
});
test("safe zone waits, closes gradually and contains its next circle", () => {
  const zone = new SafeZone(() => 0.5);
  assert.ok(
    Math.hypot(zone.nextX - zone.x, zone.nextZ - zone.z) + zone.nextRadius <=
      zone.radius,
  );
  zone.update(70);
  assert.equal(zone.state, "closing");
  zone.update(30);
  assert.equal(zone.radius, 302.5);
  zone.update(30);
  assert.equal(zone.phase, 1);
  assert.equal(zone.radius, 260);
  assert.ok(
    Math.hypot(zone.nextX - zone.x, zone.nextZ - zone.z) + zone.nextRadius <=
      zone.radius,
  );
});
test("all six phases finish after thirteen minutes and gas closes completely", () => {
  const zone = new SafeZone(() => 0.5);
  zone.update(780);
  assert.equal(zone.state, "final");
  assert.equal(zone.phase, 6);
  assert.equal(zone.radius, 0);
  assert.ok(zone.outside(zone.x + 1, zone.z));
  assert.ok(
    zone.outside(zone.x, zone.z),
    "the final centre cannot grant gas immunity",
  );
  assert.equal(zone.distance(zone.x + 10, zone.z), 10);
});
test("large and small simulation steps produce equivalent circle positions", () => {
  const a = new SafeZone(() => 0.4),
    b = new SafeZone(() => 0.4);
  a.update(245);
  for (let t = 0; t < 245; t++) b.update(1);
  assert.equal(a.radius, b.radius);
  assert.equal(a.x, b.x);
  assert.equal(a.state, b.state);
});
