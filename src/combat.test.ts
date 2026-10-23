import { test } from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { lineClear, traceShot } from "./combat";
const origin = new THREE.Vector3(0, 1, 0);
const forward = new THREE.Vector3(0, 0, -1);
const target = (id: number, z: number) => ({
  id,
  pos: new THREE.Vector3(0, 0, z),
});
function wall(z: number) {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(4, 4, 1),
    new THREE.MeshBasicMaterial(),
  );
  mesh.position.set(0, 2, z);
  mesh.updateMatrixWorld(true);
  return mesh;
}
test("solid wall blocks shots and AI sight to a target behind it", () => {
  const solids = [wall(-5)];
  const shot = traceShot(origin, forward, 100, solids, [target(3, -10)]);
  assert.equal(shot.targetId, undefined);
  assert.equal(shot.distance, 4.5);
  assert.equal(lineClear(origin, new THREE.Vector3(0, 1, -10), solids), false);
  assert.equal(lineClear(origin, new THREE.Vector3(0, 1, -3), solids), true);
});
test("nearest enemy is hit even when target list is reversed", () => {
  const shot = traceShot(
    origin,
    forward,
    100,
    [],
    [target(5, -20), target(8, -5)],
  );
  assert.equal(shot.targetId, 8);
  assert.equal(shot.head, false);
  assert.ok(shot.distance < 5);
});
test("head and body intersections produce distinct damage regions", () => {
  const shot = traceShot(
    new THREE.Vector3(0, 1.62, 0),
    forward,
    100,
    [],
    [target(1, -10)],
  );
  assert.equal(shot.targetId, 1);
  assert.equal(shot.head, true);
  assert.equal(
    traceShot(origin, forward, 100, [], [target(1, -10)]).head,
    false,
  );
});
test("targets outside weapon range or behind origin cannot be hit", () => {
  assert.equal(
    traceShot(origin, forward, 5, [], [target(1, -10)]).targetId,
    undefined,
  );
  assert.equal(
    traceShot(origin, forward, 100, [], [target(1, 5)]).targetId,
    undefined,
  );
});
test("target before a wall remains hittable and objects beside ray do not occlude", () => {
  const solid = wall(-8);
  assert.equal(
    traceShot(origin, forward, 100, [solid], [target(2, -4)]).targetId,
    2,
  );
  solid.position.x = 10;
  solid.updateMatrixWorld(true);
  assert.equal(lineClear(origin, new THREE.Vector3(0, 1, -10), [solid]), true);
});

test("invalid vectors and ranges cannot create NaN impact geometry or false visibility", () => {
  const invalid = new THREE.Vector3(NaN, 1, 0);
  assert.equal(lineClear(invalid, origin, []), false);
  assert.equal(lineClear(origin, invalid, []), false);
  for (const range of [NaN, Infinity, -1]) {
    assert.deepEqual(traceShot(origin, forward, range, [], [target(1, -4)]), {
      distance: 0,
      head: false,
    });
  }
  assert.deepEqual(traceShot(invalid, forward, 100, [], []), {
    distance: 0,
    head: false,
  });
  assert.deepEqual(traceShot(origin, invalid, 100, [], []), {
    distance: 0,
    head: false,
  });
  assert.equal(
    traceShot(
      origin,
      forward,
      100,
      [],
      [{ id: 9, pos: invalid }, target(1, -4)],
    ).targetId,
    1,
  );
});

test("crouching lowers hit volumes instead of leaving an invisible standing head", () => {
  const crouched = { ...target(1, -10), crouched: true };
  assert.equal(
    traceShot(new THREE.Vector3(0, 1.62, 0), forward, 100, [], [crouched])
      .targetId,
    undefined,
  );
  const lowShot = traceShot(
    new THREE.Vector3(0, 0.97, 0),
    forward,
    100,
    [],
    [crouched],
  );
  assert.equal(lowShot.targetId, 1);
  assert.equal(lowShot.head, true);
});

test("sight and shot queries retain independent near/far limits when reused", () => {
  const solids = [wall(-15), wall(-5)];
  assert.equal(
    traceShot(origin, forward, 100, solids, [target(1, -10)]).distance,
    4.5,
  );
  assert.equal(lineClear(origin, new THREE.Vector3(0, 1, -3), solids), true);
  assert.equal(
    traceShot(origin, forward, 3, solids, [target(1, -10)]).distance,
    3,
  );
  assert.equal(lineClear(origin, new THREE.Vector3(0, 1, -20), solids), false);
  assert.equal(
    traceShot(origin, forward, 100, [], [target(1, -10)]).targetId,
    1,
  );
});
