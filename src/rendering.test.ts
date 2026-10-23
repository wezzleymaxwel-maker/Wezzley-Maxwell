import test from "node:test";
import assert from "node:assert/strict";
import * as T from "three";
import { disposeObject } from "./rendering";

test("disposing dynamic objects releases shared-in-tree GPU assets exactly once", () => {
  const root = new T.Group(),
    scene = new T.Scene(),
    geometry = new T.BoxGeometry(),
    texture = new T.Texture();
  const material = new T.MeshStandardMaterial({ map: texture });
  const counts = { geometry: 0, material: 0, texture: 0 };
  geometry.addEventListener("dispose", () => counts.geometry++);
  material.addEventListener("dispose", () => counts.material++);
  texture.addEventListener("dispose", () => counts.texture++);
  root.add(new T.Mesh(geometry, material), new T.Mesh(geometry, material));
  scene.add(root);
  disposeObject(root);
  assert.deepEqual(counts, { geometry: 1, material: 1, texture: 1 });
  assert.equal(root.parent, null);
  assert.equal(root.children.length, 0);
});
test("preserved materials and their textures remain owned by the caller", () => {
  const root = new T.Group(),
    texture = new T.Texture(),
    material = new T.MeshStandardMaterial({ map: texture }),
    geometry = new T.BoxGeometry();
  let released = 0;
  material.addEventListener("dispose", () => released++);
  texture.addEventListener("dispose", () => released++);
  root.add(new T.Mesh(geometry, material));
  disposeObject(root, new Set([material]));
  assert.equal(released, 0);
});
