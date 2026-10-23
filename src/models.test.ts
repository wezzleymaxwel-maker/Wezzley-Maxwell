import test from "node:test";
import assert from "node:assert/strict";
import * as T from "three";
import {
  createWeapon,
  createArms,
  createOperator,
  animateOperator,
  updateOperatorAppearance,
  updateOperatorDetail,
  MODEL_SHARED_RESOURCES,
} from "./models";
import { disposeObject } from "./rendering";
function meshes(root: T.Object3D) {
  const result: T.Mesh[] = [];
  root.traverse((o) => {
    if (o instanceof T.Mesh) result.push(o);
  });
  return result;
}
test("five weapon models have distinct proportions and merge small hardware into bounded draws", () => {
  const lengths: number[] = [];
  for (let i = 0; i < 5; i++) {
    const g = createWeapon(i);
    g.updateMatrixWorld(true);
    const bounds = new T.Box3().setFromObject(g);
    lengths.push(bounds.max.z - bounds.min.z);
    assert(meshes(g).length <= 5);
    for (const m of meshes(g)) {
      assert(m.geometry.attributes.position.count > 50);
      assert([...m.geometry.attributes.position.array].every(Number.isFinite));
    }
    disposeObject(g);
  }
  assert(lengths[4] > lengths[0] * 3);
  assert(lengths[2] > lengths[3]);
  assert.equal(new Set(lengths.map((n) => n.toFixed(3))).size, 5);
});
test("operators have articulated anatomy and a one-draw distant LOD that preserves appearance", () => {
  const g = createOperator({ skin: "#b48b6e", outfit: "#61764d", weapon: 4 });
  g.updateMatrixWorld(true);
  const bounds = new T.Box3().setFromObject(g);
  assert(bounds.max.y > 1.75 && bounds.max.y < 1.95);
  assert(bounds.min.y >= -0.01);
  assert(g.getObjectByName("leftLeg"));
  assert(g.getObjectByName("rightShin"));
  animateOperator(g, 0, true);
  animateOperator(g, 0.1, true);
  assert.notEqual(g.getObjectByName("leftLeg")!.rotation.x, 0);
  updateOperatorDetail(g, 100, "medio");
  assert.equal(g.getObjectByName("detail")!.visible, false);
  assert.equal(g.getObjectByName("distant")!.visible, true);
  assert(g.getObjectByName("distant") instanceof T.Mesh);
  const far = g.getObjectByName("distant") as T.Mesh;
  assert(
    (far.geometry.index?.count ?? far.geometry.attributes.position.count) / 3 <
      1500,
    "far LOD must actually reduce triangles",
  );
  updateOperatorDetail(g, 5, "medio");
  assert.equal(g.getObjectByName("detail")!.visible, true);
  disposeObject(g);
});
test("recoloring and disposing one actor cannot mutate or destroy the next actor", () => {
  const a = createOperator({ skin: "#aa8866", outfit: "#557733", weapon: 0 }),
    b = createOperator({ skin: "#aa8866", outfit: "#557733", weapon: 0 });
  const first = meshes(a)[0],
    second = meshes(b)[0];
  assert.notEqual(first.geometry, second.geometry);
  assert.notEqual(first.material, second.material);
  const before = Array.from(second.geometry.attributes.color.array);
  updateOperatorAppearance(a, "#eeccbb", "#112233");
  assert.deepEqual(Array.from(second.geometry.attributes.color.array), before);
  let released = 0;
  for (const t of MODEL_SHARED_RESOURCES)
    t.addEventListener("dispose", () => released++);
  disposeObject(a);
  assert.equal(released, 0);
  disposeObject(b);
});
test("first person hands include detailed glove and skin surfaces but remain one draw", () => {
  const a = createArms("#aa8866", "#557733", 2);
  assert.equal(meshes(a).length, 1);
  const geometry = meshes(a)[0].geometry;
  assert(geometry.attributes.position.count > 500);
  const surfaces = Array.from(geometry.attributes.surface.array);
  assert(surfaces.includes(1) && surfaces.includes(3));
  disposeObject(a);
});
