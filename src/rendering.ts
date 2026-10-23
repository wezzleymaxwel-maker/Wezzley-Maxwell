import * as T from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
/** Batch immutable scenery in spatial cells, preserving source world matrices for collision queries.
 * Cells keep frustum culling effective: a wall at the opposite side of the map does
 * not force every wall to render. Different shadow/attribute layouts never mix.
 */
export function batchScenery(scene: T.Scene, cellSize = 70) {
  scene.updateMatrixWorld(true);
  const groups = new Map<string, { material: T.Material; meshes: T.Mesh[] }>();
  const centre = new T.Vector3();
  scene.traverse((object) => {
    if (
      !(object instanceof T.Mesh) ||
      object instanceof T.InstancedMesh ||
      Array.isArray(object.material) ||
      !(object.material instanceof T.MeshStandardMaterial) ||
      object.userData.noBatch
    )
      return;
    // Invisible proxy colliders are not scenery. Keep hidden ancestor branches
    // hidden too; flattening their meshes would accidentally render solid boxes.
    for (
      let ancestor: T.Object3D | null = object;
      ancestor;
      ancestor = ancestor.parent
    ) {
      if (!ancestor.visible) return;
    }
    const mesh = object as T.Mesh<T.BufferGeometry, T.MeshStandardMaterial>;
    mesh.geometry.computeBoundingBox();
    const bounds = mesh.geometry.boundingBox;
    if (!bounds) return;
    const size = bounds
      .getSize(new T.Vector3())
      .multiply(mesh.getWorldScale(new T.Vector3()));
    // Terrain and other map-sized surfaces should retain their own geometry.
    if (size.x > cellSize * 1.5 || size.z > cellSize * 1.5) return;
    bounds.getCenter(centre).applyMatrix4(mesh.matrixWorld);
    const attributes = Object.entries(mesh.geometry.attributes)
      .map(([key, value]) => `${key}:${value.itemSize}:${value.normalized}`)
      .sort()
      .join(",");
    const key = `${mesh.material.uuid}|${Math.floor(centre.x / cellSize)}:${Math.floor(centre.z / cellSize)}|${Number(mesh.castShadow)}${Number(mesh.receiveShadow)}|${attributes}`;
    const group: { material: T.Material; meshes: T.Mesh[] } = groups.get(
      key,
    ) ?? { material: mesh.material, meshes: [] };
    group.meshes.push(mesh);
    groups.set(key, group);
  });
  for (const { material, meshes } of groups.values()) {
    if (meshes.length < 2) continue;
    const geometries = meshes.map((mesh) => {
      const geometry = mesh.geometry.index
        ? mesh.geometry.toNonIndexed()
        : mesh.geometry.clone();
      return geometry.applyMatrix4(mesh.matrixWorld);
    });
    const merged = mergeGeometries(geometries);
    if (merged) {
      merged.computeBoundingBox();
      merged.computeBoundingSphere();
      const batch = new T.Mesh(merged, material);
      batch.name = "static-spatial-batch";
      batch.castShadow = meshes[0].castShadow;
      batch.receiveShadow = meshes[0].receiveShadow;
      batch.frustumCulled = true;
      batch.userData.noBatch = true;
      // Removed source meshes intentionally retain their existing world matrices:
      // World.solids references these geometries for first-impact raycasts.
      meshes.forEach((mesh) => mesh.removeFromParent());
      scene.add(batch);
    }
    geometries.forEach((geometry) => geometry.dispose());
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
        if (preserve.has(material) || material.userData.sharedResource)
          continue;
        materials.add(material);
        for (const value of Object.values(material)) {
          if (value instanceof T.Texture) textures.add(value);
        }
      }
    }
  });
  for (const resource of [...geometries, ...materials, ...textures]) {
    if (!preserve.has(resource) && !resource.userData.sharedResource)
      resource.dispose();
  }
  root.removeFromParent();
  root.clear();
}
