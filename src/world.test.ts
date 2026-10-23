import { test } from "node:test";
import assert from "node:assert/strict";
import { Vector3 } from "three";
import { World, type CollisionBox } from "./world";

function collisionWorld(boxes: CollisionBox[]) {
  const world = Object.create(World.prototype) as World;
  world.boxes = boxes;
  return world;
}
const wall: CollisionBox = {
  minX: 2,
  maxX: 2.5,
  minZ: -10,
  maxZ: 10,
  minY: 0,
  height: 4,
};

test("swept movement cannot tunnel through a thin solid wall", () => {
  const world = collisionWorld([wall]);
  const start = new Vector3(0, 0, 0);
  const result = world.move(start, new Vector3(20, 0, 0));
  assert.ok(result.x <= wall.minX - 0.4, `stopped before wall: ${result.x}`);
  assert.ok(result.x > 1.2);
  assert.equal(result.z, 0);
  assert.deepEqual(
    start.toArray(),
    [0, 0, 0],
    "movement must not mutate caller position",
  );
});

test("diagonal movement slides along a wall instead of stopping both axes", () => {
  const world = collisionWorld([wall]);
  const result = world.move(new Vector3(), new Vector3(4, 0, 3));
  assert.ok(result.x <= 1.6);
  assert.ok(Math.abs(result.z - 3) < 0.0001);
});

test("three metre doorway is traversable but adjacent wall still blocks", () => {
  const world = collisionWorld([
    { minX: -9, maxX: -1.5, minZ: 2, maxZ: 2.5, height: 4, minY: 0 },
    { minX: 1.5, maxX: 9, minZ: 2, maxZ: 2.5, height: 4, minY: 0 },
    { minX: -1.5, maxX: 1.5, minZ: 2, maxZ: 2.5, height: 4, minY: 3 },
  ]);
  const throughDoor = world.move(new Vector3(), new Vector3(0, 0, 5));
  assert.ok(Math.abs(throughDoor.z - 5) < 0.0001);
  const intoWall = world.move(new Vector3(3, 0, 0), new Vector3(0, 0, 5));
  assert.ok(intoWall.z <= 1.6);
});

test("map boundary clamps movement in all four directions", () => {
  const world = collisionWorld([]);
  const a = world.move(new Vector3(346, 2, 346), new Vector3(10, 1, 10));
  const b = world.move(new Vector3(-346, 0, -346), new Vector3(-10, 0, -10));
  assert.deepEqual(a.toArray(), [347, 3, 347]);
  assert.deepEqual(b.toArray(), [-347, 0, -347]);
});

test("vertical separation allows travel beneath lintels and above cover", () => {
  const world = collisionWorld([wall]);
  const above = world.move(new Vector3(0, 4, 0), new Vector3(5, 0, 0));
  assert.ok(Math.abs(above.x - 5) < 0.0001);
  const airborne = world.move(new Vector3(0, 2, 0), new Vector3(5, 0, 0));
  assert.ok(airborne.x <= 1.6, "jumping into wall remains blocked");
});

test("stair ramp meets elevated landing without a ground-height gap", () => {
  const world = collisionWorld([]);
  Object.assign(world, {
    regions: [{ x: 0, z: 0, radius: 1000, name: "Test" }],
    ramps: [
      { x: 12, z: -4.1, width: 3, length: 7.8, rise: 3.84, base: 0 },
      { x: 12, z: 1.5, width: 4, length: 3.5, rise: 0, base: 3.85 },
    ],
  });
  let previous = world.ground(12, -8);
  for (let z = -7.95; z <= 2.95; z += 0.05) {
    const height = world.ground(12, z);
    assert.ok(height >= previous - 0.0001, `stair height dropped at ${z}`);
    assert.ok(
      height - previous < 0.1,
      "stair transition should remain walkable",
    );
    previous = height;
  }
  assert.equal(world.ground(12, 2), 3.85);
});

test("vertical sweep stops jump at a ceiling and fall on top of a platform", () => {
  const world = collisionWorld([
    { minX: -4, maxX: 4, minZ: -4, maxZ: 4, minY: 3, height: 3.3 },
  ]);
  const jump = world.move(new Vector3(0, 0, 0), new Vector3(0, 10, 0));
  assert(Math.abs(jump.y - 1.35) < 1e-8, "head stops at ceiling underside");
  const fall = world.move(new Vector3(0, 10, 0), new Vector3(0, -15, 0));
  assert.equal(fall.y, 3.3, "feet land on platform instead of tunneling");
});
test("crouching changes collision height and invalid motion cannot hang", () => {
  const world = collisionWorld([
    { minX: 2, maxX: 3, minZ: -4, maxZ: 4, minY: 1.3, height: 3 },
  ]);
  assert(world.move(new Vector3(), new Vector3(5, 0, 0)).x < 2);
  assert(
    Math.abs(world.move(new Vector3(), new Vector3(5, 0, 0), 0.4, 1.05).x - 5) <
      1e-8,
  );
  assert.deepEqual(
    world.move(new Vector3(), new Vector3(Infinity, 0, 0)).toArray(),
    [0, 0, 0],
  );
  assert.deepEqual(
    world.move(new Vector3(), new Vector3(NaN, 0, 0)).toArray(),
    [0, 0, 0],
  );
});
