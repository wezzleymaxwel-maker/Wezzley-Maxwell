import * as THREE from "three";

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
  // Sight needs any obstruction, not a sorted list of every wall behind it.
  for (const solid of solids) {
    intersections.length = 0;
    raycaster.intersectObject(solid, true, intersections);
    if (intersections.length) {
      intersections.length = 0;
      return false;
    }
  }
  return true;
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
  let result: ShotResult = { distance: maxRange, head: false };
  for (const solid of solids) {
    intersections.length = 0;
    raycaster.intersectObject(solid, true, intersections);
    if (intersections.length) {
      result.distance = intersections[0].distance;
      // A nearer wall makes farther scenery irrelevant to this shot.
      raycaster.far = result.distance;
    }
  }
  intersections.length = 0;
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
