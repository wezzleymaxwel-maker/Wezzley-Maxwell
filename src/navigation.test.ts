import { test } from "node:test";
import assert from "node:assert/strict";
import { Vector3 } from "three";
import { Navigation } from "./navigation";
const point = (x: number, z: number) => new Vector3(x, 0, z);
test("navigation blocks a thin wall lying between adjacent grid cells", () => {
  const nav = new Navigation([{ minX: -0.1, maxX: 0.1, minZ: -20, maxZ: 20 }]);
  assert.equal(nav.canTraverse(point(-2, 0), point(1, 0)), false);
  const path = nav.route(point(-8, 1), point(10, 1));
  assert(path.length > 0);
  let previous = point(-8, 1);
  for (const waypoint of path) {
    assert(
      nav.canTraverse(previous, waypoint),
      `invalid edge ${previous.toArray()} -> ${waypoint.toArray()}`,
    );
    previous = waypoint;
  }
  assert(previous.distanceTo(point(10, 1)) < 2);
  assert(
    path.some((p) => Math.abs(p.z) > 20),
    "path goes around the wall",
  );
});
test("navigation permits a real doorway and blocks the neighboring walls", () => {
  const nav = new Navigation([
    { minX: -20, maxX: -1.5, minZ: -0.2, maxZ: 0.2 },
    { minX: 1.5, maxX: 20, minZ: -0.2, maxZ: 0.2 },
  ]);
  assert.equal(nav.canTraverse(point(0, -10), point(0, 10)), true);
  assert.equal(nav.canTraverse(point(4, -10), point(4, 10)), false);
  const path = nav.route(point(1, -8), point(1, 10));
  assert(path.length > 0);
  assert(
    path.every((p) => p.x < 1.1 && p.x > -1.1),
    "grid aligns with the usable doorway",
  );
});
test("unreachable goals remain bounded and never produce wall-crossing edges", () => {
  const nav = new Navigation([{ minX: -4, maxX: 4, minZ: -4, maxZ: 4 }]);
  const path = nav.route(point(-20, 1), point(0, 0));
  let previous = point(-20, 1);
  for (const waypoint of path) {
    assert(nav.canTraverse(previous, waypoint));
    previous = waypoint;
  }
  assert(path.length < 1600);
  assert.equal(nav.canTraverse(point(0, 0), point(Infinity, 0)), false);
  assert.deepEqual(nav.route(point(NaN, 0), point(0, 0)), []);
});
