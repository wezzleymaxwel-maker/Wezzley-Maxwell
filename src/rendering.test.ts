import test from "node:test";
import assert from "node:assert/strict";
import * as T from "three";
import { disposeObject, batchScenery } from "./rendering";

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

test("static batching remains spatial and preserves collision transforms and shadow flags", async () => {
  const { batchScenery } = await import("./rendering");
  const scene = new T.Scene(),
    material = new T.MeshStandardMaterial();
  const originals: T.Mesh[] = [];
  for (const x of [2, 4, 150, 152]) {
    const mesh = new T.Mesh(new T.BoxGeometry(), material);
    mesh.position.set(x, 1, 0);
    mesh.castShadow = true;
    scene.add(mesh);
    originals.push(mesh);
  }
  const unshadowed = new T.Mesh(new T.BoxGeometry(), material);
  unshadowed.position.set(6, 1, 0);
  scene.add(unshadowed);
  batchScenery(scene, 70);
  const batches = scene.children.filter(
    (o) => o.name === "static-spatial-batch",
  ) as T.Mesh[];
  assert.equal(batches.length, 2);
  assert(scene.children.includes(unshadowed));
  for (const batch of batches) {
    assert(batch.castShadow);
    assert.equal(batch.receiveShadow, false);
    assert(
      batch.geometry.boundingBox!.max.x - batch.geometry.boundingBox!.min.x < 5,
    );
  }
  assert.equal(originals[0].matrixWorld.elements[12], 2);
  assert.equal(originals[0].parent, null);
  const ray = new T.Raycaster(new T.Vector3(2, 1, 3), new T.Vector3(0, 0, -1));
  assert.equal(ray.intersectObject(originals[0]).length, 2);
});

test("shared appearance textures survive per-instance model disposal", () => {
  const root = new T.Group(),
    geometry = new T.BoxGeometry(),
    texture = new T.Texture();
  texture.userData.sharedResource = true;
  const material = new T.MeshStandardMaterial({ map: texture });
  let freedGeometry = 0,
    freedMaterial = 0,
    freedTexture = 0;
  geometry.addEventListener("dispose", () => freedGeometry++);
  material.addEventListener("dispose", () => freedMaterial++);
  texture.addEventListener("dispose", () => freedTexture++);
  root.add(new T.Mesh(geometry, material));
  disposeObject(root);
  assert.equal(freedGeometry, 1);
  assert.equal(freedMaterial, 1);
  assert.equal(freedTexture, 0);
});

test("batching never exposes invisible collider proxies or children of hidden branches", () => {
  const scene = new T.Scene(),
    material = new T.MeshStandardMaterial(),
    geometry = new T.BoxGeometry();
  for (const x of [1, 2]) {
    const mesh = new T.Mesh(geometry, material);
    mesh.position.x = x;
    scene.add(mesh);
  }
  const collider = new T.Mesh(geometry, material);
  collider.position.set(3, 2, 0);
  collider.visible = false;
  scene.add(collider);
  const hidden = new T.Group();
  hidden.visible = false;
  const child = new T.Mesh(geometry, material);
  hidden.add(child);
  scene.add(hidden);
  batchScenery(scene);
  assert.equal(collider.visible, false);
  assert.equal(collider.parent, scene);
  assert.equal(collider.matrixWorld.elements[12], 3);
  assert.equal(child.parent, hidden);
  assert.equal(
    scene.children.filter((o) => o.name === "static-spatial-batch").length,
    1,
  );
  const batch = scene.children.find(
    (o) => o.name === "static-spatial-batch",
  ) as T.Mesh;
  assert.equal(
    batch.geometry.attributes.position.count,
    72,
    "only the two visible cubes enter the batch",
  );
});
