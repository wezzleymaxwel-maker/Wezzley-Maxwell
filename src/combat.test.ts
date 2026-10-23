import { test } from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import {
  lineClear,
  traceShot,
  prepareWorldQueries,
  worldQueryStats,
} from "./combat";
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

test("prepared queries preserve diagonal and negative-cell wall occlusion", () => {
  const solids: THREE.Object3D[] = [];
  for (let i = 0; i < 45; i++) {
    const mesh = wall(0);
    mesh.position.set(Math.sin(i * 3.7) * 150, 2, Math.cos(i * 2.1) * 150);
    mesh.rotation.y = i * 0.3;
    mesh.updateMatrixWorld(true);
    solids.push(mesh);
  }
  const direct = solids.slice();
  prepareWorldQueries(solids);
  for (let i = 0; i < 100; i++) {
    const from = new THREE.Vector3(
        Math.sin(i * 2.3) * 180,
        1,
        Math.cos(i) * 180,
      ),
      to = new THREE.Vector3(
        Math.cos(i * 1.7) * 180,
        1,
        Math.sin(i * 0.9) * 180,
      ),
      direction = to.clone().sub(from).normalize();
    assert.equal(lineClear(from, to, solids), lineClear(from, to, direct));
    const accelerated = traceShot(from, direction, 400, solids, []),
      expected = traceShot(from, direction, 400, direct, []);
    assert.ok(Math.abs(accelerated.distance - expected.distance) < 1e-8);
  }
});

test("prepared instance proxies preserve translated/scaled instance collisions", () => {
  const trees = new THREE.InstancedMesh(
    new THREE.CylinderGeometry(0.4, 0.7, 6, 8),
    new THREE.MeshBasicMaterial(),
    3,
  );
  const matrix = new THREE.Matrix4();
  for (let i = 0; i < 3; i++)
    trees.setMatrixAt(i, matrix.makeTranslation(-30 + i * 30, 3, -30));
  trees.position.set(10, 0, 5);
  trees.scale.set(1.5, 1, 1.5);
  trees.updateMatrixWorld(true);
  const solids = [trees],
    direct = solids.slice();
  prepareWorldQueries(solids);
  for (const x of [-35, 10, 55, 80]) {
    const from = new THREE.Vector3(x, 1, 10),
      to = new THREE.Vector3(x, 1, -80);
    assert.equal(lineClear(from, to, solids), lineClear(from, to, direct));
    assert.ok(
      Math.abs(
        traceShot(from, forward, 100, solids, []).distance -
          traceShot(from, forward, 100, direct, []).distance,
      ) < 1e-7,
    );
  }
  assert.equal(worldQueryStats(solids)?.entries, 3);
});

test("prepared terrain triangle chunks preserve the exact first ground impact", () => {
  const geometry = new THREE.PlaneGeometry(240, 240, 50, 50);
  geometry.rotateX(-Math.PI / 2);
  const positions = geometry.attributes.position;
  for (let i = 0; i < positions.count; i++)
    positions.setY(
      i,
      Math.sin(positions.getX(i) * 0.04) * 4 +
        Math.cos(positions.getZ(i) * 0.06) * 2,
    );
  geometry.computeVertexNormals();
  const terrain = new THREE.Mesh(
    geometry,
    new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }),
  );
  terrain.position.set(-30, 2, -20);
  terrain.updateMatrixWorld(true);
  const solids = [terrain],
    direct = solids.slice();
  prepareWorldQueries(solids);
  assert((worldQueryStats(solids)?.entries ?? 0) > 20);
  for (let i = 0; i < 60; i++) {
    const from = new THREE.Vector3(
        -140 + ((i * 31) % 210),
        10,
        -120 + ((i * 47) % 200),
      ),
      to = from.clone().add(new THREE.Vector3(40, -12, -20));
    const direction = to.clone().sub(from).normalize();
    const expected = traceShot(from, direction, 100, direct, []),
      actual = traceShot(from, direction, 100, solids, []);
    assert.ok(
      Math.abs(expected.distance - actual.distance) < 1e-7,
      `terrain hit differs at ray ${i}`,
    );
    assert.equal(lineClear(from, to, solids), lineClear(from, to, direct));
  }
});

test("prepared list growth/removal rebuilds and explicit refresh handles moved geometry", () => {
  const solids: THREE.Object3D[] = [];
  prepareWorldQueries(solids);
  const mesh = wall(-5);
  solids.push(mesh);
  assert.equal(lineClear(origin, new THREE.Vector3(0, 1, -10), solids), false);
  solids.pop();
  assert.equal(lineClear(origin, new THREE.Vector3(0, 1, -10), solids), true);
  solids.push(mesh);
  prepareWorldQueries(solids);
  mesh.position.x = 100;
  mesh.updateMatrixWorld(true);
  prepareWorldQueries(solids);
  assert.equal(lineClear(origin, new THREE.Vector3(0, 1, -10), solids), true);
  solids[0] = wall(-4);
  prepareWorldQueries(solids);
  assert.equal(traceShot(origin, forward, 100, solids, []).distance, 3.5);
});

test("broad phase avoids raycasting distant meshes without skipping a nearby wall", () => {
  let farCalls = 0;
  const solids: THREE.Object3D[] = [];
  for (let i = 0; i < 120; i++) {
    const mesh = wall(-50);
    mesh.position.x = 100 + i * 4;
    mesh.updateMatrixWorld(true);
    const original = mesh.raycast;
    mesh.raycast = function (raycaster, hits) {
      farCalls++;
      original.call(this, raycaster, hits);
    };
    solids.push(mesh);
  }
  solids.push(wall(-10));
  prepareWorldQueries(solids);
  assert.equal(lineClear(origin, new THREE.Vector3(0, 1, -20), solids), false);
  assert.equal(farCalls, 0);
  assert.equal(worldQueryStats(solids)?.candidates, 1);
});
