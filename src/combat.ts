import * as THREE from "three";
import { StaticRayIndex } from "./spatial";

export interface ShotTarget {
  id: number;
  pos: THREE.Vector3;
  crouched?: boolean;
}
export interface ShotResult {
  distance: number;
  targetId?: number;
  head: boolean;
}
const EPSILON = 0.0001;
// These queries run synchronously. Reusing scratch objects avoids hundreds of
// short-lived vectors and rays every perception tick / shotgun blast.
const raycaster = new THREE.Raycaster();
const rayDirection = new THREE.Vector3();
const hit = new THREE.Vector3();
const head = new THREE.Sphere(new THREE.Vector3(), 0.2);
const body = new THREE.Box3();
const intersections: THREE.Intersection[] = [];
const finiteVector = (v: THREE.Vector3) =>
  Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z);
const prepared = new WeakMap<THREE.Object3D[], StaticRayIndex>();

/** Prepare immutable scenery after its world matrices are updated. Re-run after
 * changing transforms or replacing same-length list entries. Length changes
 * rebuild automatically; unprepared/dynamic lists retain direct raycasting. */
export function prepareWorldQueries(solids: THREE.Object3D[]) {
  const index = new StaticRayIndex(solids);
  prepared.set(solids, index);
  return { sourceObjects: index.sourceObjects, entries: index.entries.length };
}
export function worldQueryStats(solids: THREE.Object3D[]) {
  const index = prepared.get(solids);
  return index
    ? { entries: index.entries.length, candidates: index.lastCandidates }
    : undefined;
}

function worldImpact(solids: THREE.Object3D[], any = false) {
  let index = prepared.get(solids);
  if (index && index.sourceLength !== solids.length) {
    index = new StaticRayIndex(solids);
    prepared.set(solids, index);
  }
  let nearest: number | undefined;
  if (index) {
    const candidates = index.query(
      raycaster.ray,
      raycaster.near,
      raycaster.far,
    );
    for (const entry of candidates) {
      if (entry.near > raycaster.far) break;
      intersections.length = 0;
      raycaster.intersectObject(entry.object, false, intersections);
      if (!intersections.length) continue;
      nearest = intersections[0].distance;
      if (any) break;
      raycaster.far = nearest;
    }
  } else {
    for (const solid of solids) {
      intersections.length = 0;
      raycaster.intersectObject(solid, true, intersections);
      if (!intersections.length) continue;
      nearest = intersections[0].distance;
      if (any) break;
      raycaster.far = nearest;
    }
  }
  intersections.length = 0;
  return nearest;
}

/** Tests only physical world geometry; it never gives AI information behind cover. */
export function lineClear(
  from: THREE.Vector3,
  to: THREE.Vector3,
  solids: THREE.Object3D[],
) {
  if (!finiteVector(from) || !finiteVector(to)) return false;
  rayDirection.subVectors(to, from);
  const distance = rayDirection.length();
  if (distance <= EPSILON) return true;
  raycaster.set(from, rayDirection.divideScalar(distance));
  raycaster.near = EPSILON;
  raycaster.far = distance - EPSILON;
  return worldImpact(solids, true) === undefined;
}

/** First solid world impact blocks every target behind it. Positions are feet positions. */
export function traceShot(
  origin: THREE.Vector3,
  direction: THREE.Vector3,
  range: number,
  solids: THREE.Object3D[],
  targets: ShotTarget[],
): ShotResult {
  if (
    !finiteVector(origin) ||
    !finiteVector(direction) ||
    !Number.isFinite(range)
  )
    return { distance: 0, head: false };
  const maxRange = Math.max(0, range);
  if (direction.lengthSq() === 0 || maxRange === 0)
    return { distance: 0, head: false };
  raycaster.set(origin, rayDirection.copy(direction).normalize());
  raycaster.near = EPSILON;
  raycaster.far = maxRange;
  let result: ShotResult = {
    distance: worldImpact(solids) ?? maxRange,
    head: false,
  };
  const ray = raycaster.ray;
  for (const target of targets) {
    if (!finiteVector(target.pos)) continue;
    head.center.copy(target.pos);
    head.center.y += target.crouched ? 0.97 : 1.62;
    body.min.set(target.pos.x - 0.32, target.pos.y + 0.15, target.pos.z - 0.26);
    body.max.set(
      target.pos.x + 0.32,
      target.pos.y + (target.crouched ? 0.8 : 1.42),
      target.pos.z + 0.26,
    );
    for (const isHead of [true, false]) {
      const intersection = isHead
        ? ray.intersectSphere(head, hit)
        : ray.intersectBox(body, hit);
      if (!intersection) continue;
      const distance = origin.distanceTo(intersection);
      if (distance + EPSILON < result.distance)
        result = { distance, targetId: target.id, head: isHead };
    }
  }
  return result;
}
