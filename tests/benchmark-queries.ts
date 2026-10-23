/** Reproducible CPU benchmark; does not assert timing on shared CI hardware.
 * Run: npx tsx tests/benchmark-queries.ts
 */
import * as T from "three";
import assert from "node:assert/strict";
import { World } from "../src/world";
import {
  lineClear,
  traceShot,
  prepareWorldQueries,
  worldQueryStats,
} from "../src/combat";
const scene = new T.Scene(),
  world = new World(scene);
scene.updateMatrixWorld(true);
const direct = world.solids.slice();
const begun = performance.now(),
  index = prepareWorldQueries(world.solids),
  preparationMs = performance.now() - begun;
const rays = Array.from({ length: 500 }, (_, i) => {
  const x = Math.sin(i * 2.39996) * 260,
    z = Math.cos(i * 1.734) * 260,
    angle = i * 1.371,
    length = 18 + ((i * 17) % 120);
  const from = new T.Vector3(x, world.ground(x, z) + 1.55, z),
    to = new T.Vector3(
      x + Math.sin(angle) * length,
      0,
      z + Math.cos(angle) * length,
    );
  to.y = world.ground(to.x, to.z) + 1.55;
  return {
    from,
    to,
    dir: to.clone().sub(from).normalize(),
    length: from.distanceTo(to) + 5,
  };
});
function run(solids: T.Object3D[]) {
  const clear: boolean[] = [],
    distances: number[] = [];
  const start = performance.now();
  for (const ray of rays) {
    clear.push(lineClear(ray.from, ray.to, solids));
    distances.push(
      traceShot(ray.from, ray.dir, ray.length, solids, []).distance,
    );
  }
  return { ms: performance.now() - start, clear, distances };
}
const expected = run(direct),
  actual = run(world.solids);
assert.deepEqual(actual.clear, expected.clear);
actual.distances.forEach((d, i) =>
  assert(
    Math.abs(d - expected.distances[i]) < 1e-6,
    `first impact differs on ray ${i}`,
  ),
);
// Warm both paths, then alternate three rounds to reduce startup/order effects.
run(direct);
run(world.solids);
const directTimes: number[] = [],
  preparedTimes: number[] = [];
for (let i = 0; i < 3; i++) {
  directTimes.push(run(direct).ms);
  preparedTimes.push(run(world.solids).ms);
}
const median = (values: number[]) =>
  [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
let candidates = 0;
for (const ray of rays) {
  lineClear(ray.from, ray.to, world.solids);
  candidates += worldQueryStats(world.solids)!.candidates;
}
const directMedian = median(directTimes),
  preparedMedian = median(preparedTimes);
console.log(
  JSON.stringify(
    {
      rays: rays.length,
      queries: rays.length * 2,
      sceneSolids: world.solids.length,
      indexedEntries: index.entries,
      prepareMs: +preparationMs.toFixed(2),
      medianOfThree: {
        directMs: +directMedian.toFixed(2),
        preparedMs: +preparedMedian.toFixed(2),
        speedup: +(directMedian / preparedMedian).toFixed(2),
      },
      equivalent: true,
      blockedSightLines: expected.clear.filter((v) => !v).length,
      averageCandidates: +(candidates / rays.length).toFixed(2),
    },
    null,
    2,
  ),
);
