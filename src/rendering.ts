import * as T from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
/** Batch immutable procedural scenery by material. Original collision meshes retain world matrices for raycasting. */
export function batchScenery(scene: T.Scene) {
  scene.updateMatrixWorld(true);
  const groups = new Map<T.Material, T.Mesh[]>();
  scene.traverse((o) => {
    if (
      o instanceof T.Mesh &&
      !(o instanceof T.InstancedMesh) &&
      o.material instanceof T.MeshStandardMaterial
    ) {
      const list = groups.get(o.material) ?? [];
      list.push(o);
      groups.set(o.material, list);
    }
  });
  for (const [material, meshes] of groups) {
    if (meshes.length < 2) continue;
    const geometries = meshes.map((m) =>
      m.geometry.clone().applyMatrix4(m.matrixWorld),
    );
    const merged = mergeGeometries(geometries);
    if (merged) {
      const batch = new T.Mesh(merged, material);
      batch.castShadow = meshes.some((m) => m.castShadow);
      batch.receiveShadow = true;
      meshes.forEach((m) => m.removeFromParent());
      scene.add(batch);
    }
    geometries.forEach((g) => g.dispose());
  }
}

/** Release owned transient GPU assets; never use on shared static scenery.
 * `preserve` lists resources owned elsewhere (for example the shared skin material).
 */
export function disposeObject(
  root: T.Object3D,
  preserve: ReadonlySet<T.Material | T.BufferGeometry | T.Texture> = new Set(),
) {
  const geometries = new Set<T.BufferGeometry>();
  const materials = new Set<T.Material>();
  const textures = new Set<T.Texture>();
  root.traverse((object) => {
    if (
      object instanceof T.Mesh ||
      object instanceof T.Line ||
      object instanceof T.Points
    ) {
      geometries.add(object.geometry);
      const list = Array.isArray(object.material)
        ? object.material
        : [object.material];
      for (const material of list) {
        if (preserve.has(material)) continue;
        materials.add(material);
        for (const value of Object.values(material)) {
          if (value instanceof T.Texture) textures.add(value);
        }
      }
    }
  });
  for (const resource of [...geometries, ...materials, ...textures]) {
    if (!preserve.has(resource)) resource.dispose();
  }
  root.removeFromParent();
  root.clear();
}
